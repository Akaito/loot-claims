import { MODULE_CONFIG } from './config-lootClaims.js';
import { iamResponsibleGM } from './socket-lootClaims.js';

export async function givePermission({tokens=canvas.tokens.controlled, players=undefined, ignorePlayerTokens=true}={}) {
    if (ignorePlayerTokens)
        tokens = tokens.filter(t => t.actor.type != 'pc');
    if ((tokens?.length || 0) < 0) return;

    // Default to all active players.
    if (!players) {
        players = game.users.filter(user => user.active);
    }
    if ((players?.length || 0) <= 0) return;
    // Make super sure we don't alter any GM permissions.
    players = players.filter(user => !user.isGM);

    let tokenIds = tokens.map(t=>t.id);
    let playerIds = players.map(u=>u.id);

    // Upgrade player permissions to Observer so they can see/use the sheet.
    // TODO: Try out Limited.
    //let actorUpdates = [];
    for (let token of tokens) {
        let permissions = {};
        Object.assign(permissions, token.actor.data.permission);
        for (let id of playerIds) {
            // Upgrade permissions.  Be sure we never lower them.
            permissions[id] = Math.max(2, permissions[id] ? Number(permissions[id]) : 0);
        }

        /*
        actorUpdates.push({
            _id: token.actor.id,
            permission: permissions
        });
        */

        await token.actor.update({
            permission: permissions,
        });
    }
    // TODO: Can these updates be done in bulk?  This line affects the base actor all the unlinked tokens share.
    //await Actor.updateDocuments(actorUpdates);

    // Mark tokens as lootable.
    await canvas.tokens.updateAll(
        {overlayEffect: 'icons/svg/chest.svg'},
        t => tokenIds.includes(t.id)
    );
}

// TODO: Batchable distribute?  Wouldn't help looted(s), but would help looters.
export async function distributeLoot(lootees, {ignorePlayerTokens=true}={}) {
    if (!game.user.isGM) { ui.notifications.error("Only GM players can distribute loot."); return; }
    if (!iamResponsibleGM()) {
        ui.notifications.error("Only the arbitrarily-chosen responsible GM can distribute loot.");
        return;
    }

    if (!Array.isArray(lootees)) lootees = [lootees];
    for (let lootedActor of lootees) {
        lootedActor = lootedActor?.actor || lootedActor;
        if (!lootedActor) return; // TODO: Present an error message from here.
        if (ignorePlayerTokens && lootedActor.type == 'pc') continue;

        /* REM
        const uuid = <token>.actor.uuid;
        let document = await fromUuid(uuid);
        let actorData = document.data.actorData || document.data; // To ensure unlinked tokens resolve to the "same" thing as linked ones.

        note fromUuid on a client (non-GM?) returns an object.
        fromUuid on the stand-alone server GM yields an Actor5e (or token document if unlinked)
        */

        let itemUpdates = [];
        for (const [lootItemId, lootItem] of lootedActor.items.entries()) {
            // Skip items that've already been looted.
            if (lootItem.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.lootedByKey)) continue;
            // Also skip hidden items.
            if (lootItem.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.hiddenKey)) continue;

            // Find and collect the set of needs and greeds claims.
            const claims = lootItem.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.claimsKey);
            if (!claims) continue;
            const needs = claims.filter(claim => claim.claimType == 'need') || [];
            const greeds = claims.filter(claim => claim.claimType == 'greed') || [];

            // Roll among the prioritized set of claimants (needs beat greeds).
            let claimantIds = needs.length > 0 ? needs : greeds;
            // Skip if no-one wants the item.
            if (claimantIds.length <= 0) continue;

            await giveLootTo(lootedActor, lootItem, claimantIds);

            //await lootItem.setFlag(MODULE_CONFIG.name, MODULE_CONFIG.lootedByKey, claimantClaims[0].uuid);
            // TODO: Store how much went to who.
            itemUpdates.push({
                _id: lootItem.id,
                //id: lootItem.id,
                flags: {
                    [MODULE_CONFIG.name]: {
                        [MODULE_CONFIG.lootedByKey]: claimantIds,
                    },
                },
            });
        }

        // Mark any items which were looted.
        //log('itemUpdates from _onDistributeLootClick():', itemUpdates);
        await lootedActor.updateEmbeddedDocuments('Item', itemUpdates);
    }
}

/*
/// In-place shuffle.
/// From https://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array/6274381#6274381
function shuffleArray(arr) {
    for (let i = arr.length - 1; 0 < i; --i) {
        const j = Math.floor(Math.random() * (i+1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
*/

async function giveLootTo(sourceActor, sourceItem, claimantClaims) {
    if (claimantClaims.length <= 0) return;

    // Shuffle the claimant array so we can have a random order in which people get the loot.
    // Also ensure we were given UUIDs, not claim flags.  `uuidFromClaimFlag()` is idemptotent.
    // TODO: Chat card, Dice So Nice, something else?
    //claimantUuids = shuffleArray(claimantUuids).map(uuid => uuidFromClaimFlag(uuid));
    //claimantClaims = shuffleArray(claimantClaims);
    doClaimantRolls(claimantClaims);
    claimantClaims.sort((a,b) => b.roll.total - a.roll.total); // sort descending

    // Figure out who's getting how much of the loot.
    // We don't deal in fractional quantities.
    const sourceItemQuantity = Math.floor(Number(sourceItem.data?.data?.quantity)) || 1;
    const quantityRemainder = sourceItemQuantity % claimantClaims.length; // dnd5e
    const quantityEvenlySharable = Math.floor(sourceItemQuantity / claimantClaims.length);

    let newItemData = duplicate(sourceItem);
    // Clear claim keys, and set where the item we're handing out came from.
    newItemData.flags[MODULE_CONFIG.name] = {
        'looted-from-uuid': sourceActor.uuid,
        'looted-from-name': sourceActor.name,
    };
    // The recipient's new item shouldn't be equipped, since it's just been looted.
    if (newItemData.data?.equipped === true) { // dnd5e, possibly other systems TODO: move to module config handles
        newItemData.data.equipped = false;
    }

    // Hand out the items
    for (let [claimantIndex, claimantClaim] of claimantClaims.entries()) {
        const gettingSomeRemainder = claimantIndex < quantityRemainder;
        // If not everyone is getting some, and we've run out of the remainder, we're done.
        if (quantityEvenlySharable <= 0 && !gettingSomeRemainder) break;

        let parent = await fromUuid(claimantClaim.uuid);
        parent = parent?.actor || parent; // To make tokens and actors the "same".
        if (!parent) {
            error('Skipping claimant UUID for which no actor could be found', claimantClaim.uuid, 'named', claimantClaim.name);
            continue;
        }

        // Consider a pre-existing item on the actor to be the same as this new
        // loot item if its type and name match.  Imperfect, but might be the most
        // sane means without being _too_ restrictive.
        const existingItem = parent.items.find(actorItem => actorItem.type == newItemData.type && actorItem.name == newItemData.name);
        // If the actor already has the item, just increase its quantity.
        if (existingItem) {
            // Not gaining a Broken version of an existing item: just increase existing quantity.
            //if (!actorItemUnbroken || actorItemUnbroken.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.hiddenKey)) {
            if (existingItem) {
                // TODO: Do this all at once; not in separate calls like this.
                await parent.updateEmbeddedDocuments('Item', [{
                    _id: existingItem.id,
                    //id: existingItem.id,
                    data: {
                        quantity: Number(existingItem.data.data.quantity) + quantityEvenlySharable + (gettingSomeRemainder ? 1 : 0),
                    },
                }]);
                continue;
            }
        }
        
        mergeObject(newItemData, {
            data: {
                quantity: quantityEvenlySharable + (gettingSomeRemainder ? 1 : 0), // dnd5e
            },
        });
        //console.log(MODULE_CONFIG.emoji, 'newItemData', newItemData);

        const recipientItem = await Item.create(newItemData, {
            parent,
        });
        //console.log(MODULE_CONFIG.emoji, 'recipientItem', recipientItem);
    }

    // Mark the lootee's item as having been looted.
    // TODO: Mark array of winners, not just single, due to stack-split wins?
    // TODO: Distribute all updates in one update.  Optimization, and prevents sheet flicker.
    // TODO: Array of all loot winners (with quantities?); not a single 'winner' UUID.
    // TODO: Doing too many items at once was failing to flag the source item, despite the new item being created.
    //       Here's a hack for now.  Which still doesn't entirely work.
    //await new Promise(resolve => setTimeout(resolve, 1000));
    //await sourceItem.setFlag(MODULE_CONFIG.name, MODULE_CONFIG.lootedByKey, claimantClaims[0].uuid);
}

function doClaimantRolls(claimantClaims) {
    // NOTE: Potential to have weird, non-normal-faced dice with a high enough number of claimants.
    let rollOutcomes = [...Array(Math.max(MODULE_CONFIG.rollMaxValue, claimantClaims.length)).keys()];
    // Outcomes are 0 through 1-less-than-max.
    // Just overwrite invalid zero with the missing max value.
    rollOutcomes[0] = rollOutcomes[-1] + 1;
    for (let [claimIndex,claim] of claimantClaims.entries()) {
        //const outcomeIndex = Math.floor(Math.random() * rollOutcomes.length);
        const outcomeIndex = Math.floor(MersenneTwister.random() * rollOutcomes.length);
        // TODO: Provide a real Roll instance.
        claim.roll = {total: rollOutcomes[outcomeIndex]};
        rollOutcomes[outcomeIndex] = rollOutcomes.pop();
        //claimantClaims[index].roll = new Roll(`1d${MODULE_CONFIG.rollMaxValue}`);
        //claimantClaims[index].roll = {total: rollValue};
    }
}
