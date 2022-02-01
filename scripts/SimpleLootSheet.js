import { MODULE_CONFIG } from './config-lootClaims.js';
import { decodeUuidFromFlag, encodeUuidForFlag, uuidFromClaimFlag } from './module-lootClaims.js';
import { iamResponsibleGM } from './socket-lootClaims.js';
import { handleSocketGm } from './socket-lootClaims.js';
import * as util from './util-lootClaims.js';
const log = util.log;

export class ClaimantClaim {
    // Future: allow claiming only some quantity.
    constructor(uuid, claimType, name, img) {
        // Required.
        this.uuid = uuid;
        this.claimType = claimType;
        this.roll = false; // to be replaced by a Roll, or a numeric value.
        this.receivedQuantity = 0; // updated after loot is doled out.
        // Extra for ease of use (mostly in Handlebars).
        this.name = name;
        this.img = img;
    }
}

/// For the client to express interest in claiming an item (or passing on one).
///
/// References:
/// - https://discord.com/channels/170995199584108546/903652184003055677/903693659051008040
/// - https://discord.com/channels/170995199584108546/811676497965613117/903652184003055677
/// - https://discord.com/channels/170995199584108546/670336275496042502/835549329598840903
async function makeClaim(claimantUuids, claimType, itemUuid) {
    log('makeClaim()', claimantUuids, claimType, itemUuid);

    const message = {
        type: MODULE_CONFIG.messageTypes.CLAIM_REQUEST,
        claimType,
        claimantUuids,
        itemUuid,
    };
    // TODO: Make this true only if we're the responsible GM.  Not just any GM.
    if (iamResponsibleGM()) {
        await handleSocketGm(message, game.user.data._id);
    }
    else {
        new Promise(resolve => {
            // TODO: Move response to a function above this scope, so the GM user can call it, too?
            socket.emit(MODULE_CONFIG.socket, message, response => {
                    //log('GOT A REQUEST RESPONSE!');
                    //log(response);
                    ui.notifications.warn("Got request response!");
                    resolve(response);
                }
            );
        });
    }
}

export async function findLootTable(actor) {
    actor = actor?.actor || actor; // Change token to actor if needed.
    if (!actor) return undefined;
    const betterRollTablesActive = game.modules.get('better-rolltables')?.active || false;
    // May get a name like "Compendium.scope.compendium-id.actor-id".
    //let coreName = token.actor.data.flags?.core?.sourceId;
    //coreName = coreName.split('.');
    // The first table-get that gives us something wins.
    //   TODO?: Check the world first, then compendiums.  We may only be checking
    //          the world here.

    let possibleTableNames = [
        actor.name, // Token's or actor's name.
        game.actors.get(actor.id)?.name, // Original, world-scope actor's name.
        actor.data.flags?.ddbimporter?.originalItemName, // Original D&DB importer's actor's name.
    ];
    for (const name of possibleTableNames) {
        const table = game.tables.getName(name);
        if (table) return table;
    }

    // Next, try the compendiums.
    const packs = game.packs.filter(p => p.metadata.type == 'RollTable');
    for (const pack of packs) {
        for (const name of possibleTableNames) {
            const compendiumTableId = pack.index.find(e => e.name == name)?._id;
            if (!compendiumTableId) continue;
            const compendiumTable = await pack.getDocument(compendiumTableId);
            if (compendiumTable) return compendiumTable;
        }
    }

    /*
    return game.tables.getName(actor.name) || // used to be token's name, which _can_ be useful
        // Same name as the original actor (if there is one).
        game.tables.getName(game.actors.get(actor.id)?.name) ||
        // Same name as the original thing imported by the D&D Beyond Importer module.
        game.tables.getName(token.actor.data.flags?.ddbimporter?.originalItemName)
        // TODO: Try to regex-out Token Mold name changes?
    ;
    */
}

/// In-place shuffle.
/// From https://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array/6274381#6274381
function shuffleArray(arr) {
    for (let i = arr.length - 1; 0 < i; --i) {
        const j = Math.floor(Math.random() * (i+1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function getClaimantRollsOld(claimantUuids) {
    let results = [];
    results.push();
    for (let uuid of claimantUuids) {
        let roll;
        // TODO: Instead of this dumb while that can loop forever,
        //       let rolls tie and figure out a tie-breaker instead.
        while (!roll || results.find(result => result.total == roll.total)) {
            roll = new Roll(MODULE_CONFIG.rollFormula).roll({async: false});
        }
        results.push({
            uuid,
            roll,
        });
    }
    results.sort((a,b) => a.roll.total - b.roll.total);
    log(MODULE_CONFIG.emoji, 'claimant rolls, sorted, etc.', results);
    return results;
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

async function giveLootTo(sourceActor, sourceItem, claimantClaims) {
    if (claimantClaims.length <= 0) return;

    //log('sourceItem', sourceItem);
    // Shuffle the claimant array so we can have a random order in which people get the loot.
    // Also ensure we were given UUIDs, not claim flags.  `uuidFromClaimFlag()` is idemptotent.
    // TODO: Chat card, Dice So Nice, something else?
    //claimantUuids = shuffleArray(claimantUuids).map(uuid => uuidFromClaimFlag(uuid));
    //claimantClaims = shuffleArray(claimantClaims);
    console.log(MODULE_CONFIG.emoji, 'giveLootTo() -- claims before rolls:', claimantClaims);
    doClaimantRolls(claimantClaims);
    console.log(MODULE_CONFIG.emoji, 'giveLootTo() -- claims after rolls:', claimantClaims);
    claimantClaims.sort((a,b) => b.roll.total - a.roll.total); // sort descending
    console.log(MODULE_CONFIG.emoji, 'giveLootTo() -- claims after sort:', claimantClaims);

    // Figure out who's getting how much of the loot.
    // We don't deal in fractional quantities.
    const sourceItemQuantity = Math.floor(Number(sourceItem.data?.data?.quantity)) || 1;
    const quantityRemainder = sourceItemQuantity % claimantClaims.length; // dnd5e
    const quantityEvenlySharable = Math.floor(sourceItemQuantity / claimantClaims.length);
    console.log(MODULE_CONFIG.emoji, sourceItemQuantity, quantityRemainder, quantityEvenlySharable);

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
        log('hand out for', {quantityEvenlySharable, quantityRemainder, claimantIndex, gettingSomeRemainder});
        if (quantityEvenlySharable <= 0 && !gettingSomeRemainder) break;

        let parent = await fromUuid(claimantClaim.uuid);
        parent = parent?.actor || parent; // To make tokens and actors the "same".
        if (!parent) {
            log('no parent');
            error('Skipping claimant UUID for which no actor could be found', claimantClaim.uuid, 'named', claimantClaim.name);
            continue;
        }

        mergeObject(newItemData, {
            data: {
                quantity: quantityEvenlySharable + (gettingSomeRemainder ? 1 : 0), // dnd5e
            },
        });
        console.log(MODULE_CONFIG.emoji, 'newItemData', newItemData);

        const recipientItem = await Item.create(newItemData, {
            parent,
        });
        console.log(MODULE_CONFIG.emoji, 'recipientItem', recipientItem);
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

export class SimpleLootSheet extends ActorSheet {

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 700,
            height: 'auto',
            classes: [MODULE_CONFIG.ns, 'sheet', 'actor'],
        });
    }

    get template() {
        return `modules/${MODULE_CONFIG.name}/templates/loot-sheet.hbs`;
    }

    activateListeners(html) {
        html.find('.player-claims').click(this._onClaimClick.bind(this));
        html.find('.reset-loot').click(this._onResetLootClick.bind(this));
        html.find('.add-loot-table').click(this._onAddLootTableClick.bind(this));
        html.find('.give-permissions').click(this._onGivePermissionsClick.bind(this));
        html.find('.distribute-loot').click(this._onDistributeLootClick.bind(this));

        super.activateListeners(html);
    }

    async getData() {
        log('--- BEGIN getData()');
        let data = super.getData();
        data.MODULE_CONFIG = MODULE_CONFIG;

        data.lootTable = await findLootTable(this);

        data.isGM = game.user.isGM;
        //data.iamResponsibleGm = iamResponsibleGM(); // Storing this in this way causes the result to be false somehow.

        // Add claims data in a different layout for the sake of Handlebars templating.
        data.claims = {};
        for (let item of this.actor.items) {
            // dnd5e: skip "natural" weapons, spells, features, etc.
            if (item.data?.data?.weaponType == 'natural') continue;
            if (item.data?.data?.armor?.type == 'natural') continue;
            if (MODULE_CONFIG.excludedItemTypes.includes(item.type)) continue;
            if (item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.hiddenKey)) continue;

            // Get our module's flags for this item, and translate them into a form that's easier
            // for Handlebars templates to digest.
            const ourFlags = item.data.flags[MODULE_CONFIG.name];
            data.claims[item.uuid] = {
                uuid: item.uuid,
                name: item.name,
                img: item.img,
                quantity: item.data.data.quantity,
                [MODULE_CONFIG.lootedByKey]: ourFlags ? ourFlags[MODULE_CONFIG.lootedByKey] : undefined,
                //[MODULE_CONFIG.needKey]: item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.claimTypes) || [],
                //[MODULE_CONFIG.greedKey]: item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.greedKey) || [],
                //[MODULE_CONFIG.passKey]: item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.passKey) || [],
            };
            log('getData()\'s ourFlags', ourFlags);
            for (let claimType of MODULE_CONFIG.claimTypes) {
                log(`looking for [${claimType}] claims on item ${item.name}`, item);
                if (!ourFlags || !ourFlags[MODULE_CONFIG.claimsKey]) {
                    data.claims[item.uuid][claimType] = [];
                    log(' NO STUFF TO GET?');
                }
                else {
                    //log(' SHOULD GET STUFF', ourFlags[MODULE_CONFIG.claimsKey]);
                    data.claims[item.uuid][claimType] = ourFlags[MODULE_CONFIG.claimsKey]
                        .filter(claim => claim.claimType == claimType);
                }
            }
            if (!ourFlags) continue;

            for (let claimType of MODULE_CONFIG.claimTypes) {
                for (let claimantUuid of item.getFlag(MODULE_CONFIG.name, claimType) || []) {
                    //log(claimType, claimantUuid, typeof(claimantUuid));
                    //log((await canvas.tokens.getDocuments()).find(t=>t.uuid == claimantUuid));
                    let actor = null;//await fromUuid(claimantUuid.uuid);
                    if (!actor) {
                        //console.error('blah'); // TODO: Proper error message.
                        continue;
                    }
                    data.claims[item.uuid][claimType].push({
                        uuid: claimantUuid.uuid,
                        name: actor.token?.name || actor.name,
                        img: actor.token?.data?.img || actor.img,
                    });
                }
            }

            log('sheet\'s getData()\'s data.claims:', data.claims);
        }

        log('--- END getData()');
        //log('CLAIMS laid out for hbs', data.claims);
        return data;
    }


    async _onClaimClick(event) {
        log('_onClaimClick()');
        event.preventDefault();
        const element = event.currentTarget;
        const itemUuid = element.closest('.item').dataset.itemUuid;
        //let item = this.actor.getOwnedItem(itemId);
        //let item = this.actor.getEmbeddedDocument('Item', itemId, {strict:false});
        let item = await fromUuid(itemUuid);
        // TODO: FUTURE: Don't use flags, since they're stored in the DB.  Use transient memory.
        //log('item', item);
        //log('itemLootFlags', itemLootFlags);

        let claimType = element.closest('.player-claims').dataset.claimType;

        let claimantUuids = canvas.tokens.controlled // Prefer currently-selected tokens we own.
            .filter(token => token.isOwner)
            .map(token => token.actor?.uuid)
            .filter(uuid => uuid != undefined)
            // Don't make a claim again if we already have one of the same type being asked for.
            //.filter(uuid => itemLootFlags[uuid] ? itemLootFlags[uuid] != claimType : true)
        ;
        // Fallback to user's assigned character, if they have one.
        if (claimantUuids.length <= 0)
            claimantUuids = game.user.character ? [`Actor.${game.user.character.id}`] : []; // janky way to make it a uuid
        //log('new choice', claimantUuids);
        if (claimantUuids.length <= 0) {
            ui.notifications.error(game.i18n.localize(`${MODULE_CONFIG.name}.noClaimantAvailable`));
            return;
        }
        

        // If clicking on the same claim type on the same item the player's already in,
        // cancel it back to a "pass" claim.
        //if (let existingClaims = element.find('[data-claimant-uuid]')
        if (claimantUuids?.length == 1 && claimType != 'pass')  {
            if ((item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.claimsKey) || [])
                ?.find(claim => claim.uuid == claimantUuids[0])
                ?.claimType == claimType)
            {
                claimType = 'pass';
                log('Already have this claim; flipping back to unspent.');
            }
        }

        await makeClaim(claimantUuids, claimType, item.uuid);
    }

    async _onGivePermissionsClick(event) {
        event.preventDefault();
        let activePlayers = game.users.filter(user => !user.isGM && user.active);
        if (activePlayers.length <= 0) return;
        let activePlayerIds = activePlayers.map(u=>u.id);

        // Upgrade player permissions to Observer so they can see/use the sheet.
        // TODO: Try out Limited.
        let permissions = {};
        Object.assign(permissions, this.token.actor.data.permission);
        for (let id of activePlayerIds) {
            // Upgrade permissions.  Be sure we never lower them.
            permissions[id] = Math.max(2, permissions[id] ? Number(permissions[id]) : 0);
        }
        //log('new permissions', permissions);
        //log('Permissions:', permissions);
        //log(this);
        //log('token comparison', this.token, canvas.tokens.controlled[0].document);
        // TODO: Do these updates together.
        await this.token.update({
            overlayEffect: 'icons/svg/chest.svg',
        });
        await this.token.modifyActorDocument({
            permission: permissions,
        });
        //log('permissions after application', this.actor.data.permission);
    }

    async _onDistributeLootClick(event) {
        event.preventDefault();
        if (!game.user.isGM) { ui.notifications.error("Only GM players can distribute loot."); return; }
        if (!iamResponsibleGM()) {
            ui.notifications.error("Only the arbitrarily-chosen responsible GM can distribute loot.");
            return;
        }

        const element = event.currentTarget;
        const actor = this.actor;
        //log(actor);

        /* REM
        const uuid = <token>.actor.uuid;
        let document = await fromUuid(uuid);
        let actorData = document.data.actorData || document.data; // To ensure unlinked tokens resolve to the "same" thing as linked ones.

        note fromUuid on a client (non-GM?) returns an object.
        fromUuid on the stand-alone server GM yields an Actor5e (or token document if unlinked)
        */

        let itemUpdates = [];
        //log('items:');
        for (const [lootItemId, lootItem] of this.actor.items.entries()) {
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

            await giveLootTo(this.actor, lootItem, claimantIds);

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
        log('itemUpdates from _onDistributeLootClick():', itemUpdates);
        await this.actor.updateEmbeddedDocuments('Item', itemUpdates);
    }

    async _onResetLootClick(event) {
        event.preventDefault();
        if (!game.user.isGM) { ui.notifications.error("Only GM players can distribute loot."); return; }
        if (!iamResponsibleGM()) {
            ui.notifications.error(game.i18n.localize('loot-claims.responsibleGmOnly'));
            return;
        }

        const actor = this.actor;

        MODULE_CONFIG.functions.reset(actor);
    }

    async _onAddLootTableClick(event) {
        if (!game.user.isGM) { ui.notifications.error("Only GM players can distribute loot."); return; }
        if (!iamResponsibleGM()) {
            ui.notifications.error(game.i18n.localize('loot-claims.responsibleGmOnly'));
            return;
        }

        const element = event.currentTarget;
        //log('elements:', element, element.closest('[data-roll-table-uuid]'));
        const tableUuid = $(element.closest('[data-roll-table-uuid]'))?.data('roll-table-uuid');
        const table = await fromUuid(tableUuid);
        if (!table)  {
            ui.notifications.error(game.i18n.localize(`${MODULE_CONFIG.name}.noSuchTable`));
            //log('Was asked to find a table, but none existed with the given uuid:', tableUuid);
            return;
        }

        if (game.betterTables) {
            //game.betterTables.addLootToSelectedToken(this); // Nope; want to pass in item flags.
            //let result = await game.betterTables.addLootToSelectedToken(cloneTable, this.actor);
            UseBetterTables(this.token, table);
        }
        else {
            // TODO: UNIMPLEMENTED
            ui.notifications.error('Currently reliant on the Better Roll Tables module.');
        }
    }
}

// Mostly from a macro I hadn't shared yet.
async function UseBetterTables (token, realTable) {
    // Clone the table so we can do whatever without worry.
    // Including just drawing without replacement.
    let table = realTable.clone({}, {}, {temporary:true});
    const newLoot = {};

    // TODO: Manually do draw-without-replacement if the table is flagged as such.
    //       Since drawing from a compendium table flagged as such doesn't work
    //       (never locks-out results).  Since we're making this module for us first,
    //       and we're using Anne Gregersen's _Monster Loot_ in a particular way for
    //       expediency, just give 1 of each result in the roll table.  Or, if it's
    //       a BetterRollTable with a formula for quantities, use that instead of 1.

    let drawnItems = [];
    for (let result of table.data.results) {
        //log('result', result);
        let collection = game.packs.get(result.data.collection);
        /*
        let lootItem = (await collection?.getDocument(result.data.resultId))?.clone({
                data: {
                    flags: {
                        [MODULE_CONFIG.name]: {
                            [MODULE_CONFIG.generatedFromKey]: realTable.uuid,
                        },
                    },
                },
            },
            false,
            {temporary:true});
        */
        let lootItem = duplicate(await collection?.getDocument(result.data.resultId));
        //lootItem.data.data.quantity = 500;
        mergeObject(lootItem, {
            data: {
                /*
                data: {
                    quantity: 500,
                },
                */
                flags: {
                    [MODULE_CONFIG.name]: {
                        [MODULE_CONFIG.generatedFromKey]: realTable.uuid,
                    },
                },
            },
        });
        //log('compendium lootItem', lootItem);
        const brtFlags = result.data.flags['better-rolltables'];
        //log('brtFlags', brtFlags);
        if (brtFlags) {
            const quantityFormula = brtFlags['brt-result-formula']?.formula;
            //log('formula', quantityFormula);
            log('are we even trying to get a quantity?', quantityFormula);
            try {
                let quantity = (await (new Roll(quantityFormula)).roll({async: true}))?.total;
                log('quantity', quantity, lootItem.data.quantity);
                if (quantity) {
                    mergeObject(lootItem, {
                        data: {
                            quantity: Number(lootItem.data.quantity) * Number(quantity),
                        },
                    });
                    //log('new quantity', lootItem.data.data.quantity);
                }
            }
            catch (e) {console.error(e);}
        }
        drawnItems.push(lootItem);
    }
    //log('drawn items', drawnItemsData);

    const preExistingItems = token.actor.getEmbeddedCollection('Item');
    const itemUpdates = [];
    const newItems = [];
    // Figure out whether each loot entry is already present on the receiving
    // token, or is totally new to it.  How we add it differs depending on that.
    for (const lootItem of drawnItems) {
        // TODO: Consider localization.  Both the word, and the name structure.
        const isBrokenItem = lootItem.name.startsWith('Broken ');
        //log(lootItemData);
        /*
        // TODO: Don't assume the loot table's contents is a Compendium item.
        // (Thanks to Discord Crymic#9452 for help with compendium/pack access.)
        // https://discord.com/channels/170995199584108546/699750150674972743/897045003526869012
        const pack = await game.packs.get(loot.collection);
        const packDocs = await pack?.getDocuments();
        const packItem = await packDocs?.find(item => item.data._id == loot.resultId);
        if (!packItem) {
            ui.notifications.error(`No such compendium item: ${loot.collection}.${loot.resultId} (${loot.text}).`);
            continue;
        }
        */

        // TODO?: If we've already imported the item to this world (compare by name?), use that instead.

        // Consider a pre-existing item on the actor to be the same as this new
        // loot item if its type and name match.  Imperfect, but might be the most
        // sane means without being _too_ restrictive.
        const existingItem = preExistingItems.find(actorItem => actorItem.type == lootItem.type && actorItem.name == lootItem.name);
        // If the actor already has the item, just increase its quantity.
        if (existingItem) {
            // Not gaining a Broken version of an existing item: just increase existing quantity.
            //if (!actorItemUnbroken || actorItemUnbroken.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.hiddenKey)) {
            if (existingItem) {
                itemUpdates.push({
                    _id: existingItem.id,
                    id: existingItem.id,
                    data: {
                        quantity: Number(existingItem.data.data.quantity) + Number(lootItem.data.quantity),
                    },
                });
            }
        }

        // Need to hide the existing, not-broken version if it isn't already.
        if (lootItem.name.startsWith('Broken')) {
            const actorItemUnbroken = preExistingItems.find(actorItem => {
                const nameGood = `Broken ${actorItem.name}` == lootItem.name;
                //log('not-broken search', actorItem.name, lootItem.name, nameGood, actorItem.type, lootItem.type, actorItem.type == lootItem.type);
                //return actorItem.type == lootItem.type && nameGood;
                return nameGood; // Don't compare item types.  Broken versions are likely to be loot or something; instead of equipment.
            });
            log('unbroken item is', actorItemUnbroken);
            if (actorItemUnbroken && !actorItemUnbroken.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.hiddenKey)) {
                itemUpdates.push({
                    _id: actorItemUnbroken.id,
                    id: actorItemUnbroken.id,
                    flags: {
                        [MODULE_CONFIG.name]: {
                            [MODULE_CONFIG.hiddenKey]: 'broken', // TODO: Use some thought-out value.
                        },
                    },
                });
            }
        }

        // Make a new one if it doesn't exist yet.
        if (!existingItem) {
            log('making new item from packItem', lootItem, table);
            mergeObject(lootItem, {
                data: {
                    quantity: Number(lootItem.data.quantity),
                },
                flags: {
                    [MODULE_CONFIG.name]: {
                        //'source-item': encodeUuidForFlag(lootItemData.uuid),
                        'generated-from': encodeUuidForFlag(table.uuid),
                    },
                },
            });
            //let newItemLootFlags = newItemData.data.flags['loot-claims'] || {};
            //newItemLootFlags[MODULE_CONFIG.generatedFromKey] = pack.uuid;
            newItems.push(lootItem);
        }
    }

    //log('itemUpdates', itemUpdates);
    log('newItems', newItems);

    // Update quantities.
    await token.actor.updateEmbeddedDocuments('Item', itemUpdates);
    // Create items.
    //await token.actor.createEmbeddedDocuments('Item', newItems);
    await Item.createDocuments(newItems/*.map(item => item.data)*/, {
        parent: token.actor,
    });
    //await table.reset(); // No point; it's a cloned table.
}
