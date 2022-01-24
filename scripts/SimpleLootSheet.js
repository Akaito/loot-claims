import { MODULE_CONFIG } from './config.js';
import { claimFlagFromUuid, handleSocketGm, iamResponsibleGM, uuidFromClaimFlag } from './module.js';

/// For the client to express interest in claiming an item (or passing on one).
///
/// References:
/// - https://discord.com/channels/170995199584108546/903652184003055677/903693659051008040
/// - https://discord.com/channels/170995199584108546/811676497965613117/903652184003055677
/// - https://discord.com/channels/170995199584108546/670336275496042502/835549329598840903
async function makeClaim(claimantUuid, claimType, itemUuid) {
    console.log('makeClaim()', claimantUuid, claimType, itemUuid);

    const message = {
        type: MODULE_CONFIG.messageTypes.CLAIM_REQUEST,
        claimType,
        claimantUuid,
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
                    //console.log('GOT A REQUEST RESPONSE!');
                    //console.log(response);
                    ui.notifications.warn("Got request response!");
                    resolve(response);
                }
            );
        });
    }
}

export class SimpleLootSheet extends ActorSheet {

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 700,
            height: 430,
            classes: [MODULE_CONFIG.ns, 'sheet', 'actor'],
        });
    }

    get template() {
        return `modules/${MODULE_CONFIG.name}/templates/loot-sheet.hbs`;
    }

    activateListeners(html) {
        html.find('.player-claims').click(this._onClaimClick.bind(this));
        html.find('.distribute-loot').click(this._onDistributeLootClick.bind(this));

        super.activateListeners(html);
    }

    async getData() {
        let data = super.getData();
        data.MODULE_CONFIG = MODULE_CONFIG;

        data.isGM = game.user.isGM;
        //data.iamResponsibleGm = iamResponsibleGM(); // Storing this in this way causes the result to be false somehow.

        // Add claims data in a different layout for the sake of Handlebars templating.
        data.claims = {};
        for (let item of this.actor.items) {
            const ourFlags = item.data.flags[MODULE_CONFIG.name];
            data.claims[item.uuid] = {
                uuid: item.uuid,
                name: item.name,
                img: item.img,
                isStack: item.isStack,
                quantity: item.data.quantity,
                lootedBy: ourFlags ? ourFlags[MODULE_CONFIG.lootedByKey] : undefined,
                needs: [],
                greeds: [],
            };
            if (!ourFlags) continue;

            for (const key of Object.keys(ourFlags)) {
                if (!key.startsWith('claim-')) continue;
                const value = ourFlags[key];
                const claimantUuid = uuidFromClaimFlag(key);
                let actor = await fromUuid(claimantUuid);
                if (!actor) {
                    //console.log(`Skipping Actor ID in claims flags which didn't match an actor: ${key}`);
                    continue;
                }
                actor = actor.actor ? actor.actor : actor; // Get Actor5e from TokenDocument5e if needed.

                let lootedByUuid = uuidFromClaimFlag(ourFlags[MODULE_CONFIG.lootedByKey]);
                console.log('looted by', lootedByUuid, 'we are', key);

                let claimant = {
                    uuid: claimantUuid,
                    name: actor.name,
                    img: actor.img,
                    winner: lootedByUuid == claimantUuid,
                };
                switch (value) {
                    case MODULE_CONFIG.needKey: data.claims[item.uuid].needs.push(claimant); break;
                    case MODULE_CONFIG.greedKey: data.claims[item.uuid].greeds.push(claimant); break;
                }
            }
        }

        //console.log('CLAIMS laid out for hbs', data.claims);
        return data;
    }


    async _onClaimClick(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const itemUuid = element.closest('.item').dataset.itemUuid;
        //let item = this.actor.getOwnedItem(itemId);
        //let item = this.actor.getEmbeddedDocument('Item', itemId, {strict:false});
        let item = await fromUuid(itemUuid);
        // TODO: FUTURE: Don't use flags, since they're stored in the DB.  Use transient memory.
        let flags = item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.claimsKey) || {};
        //console.log('item', item);
        //console.log('flags', flags);

        const claimType = element.closest('.player-claims').dataset.claimType;

        // TODO: If more than one token is controlled, make claims from all of them?
        const selectedOwnedToken = canvas.tokens.controlled.filter(t=>t.isOwner)[0];
        const claimantUuid =
            // A selected, owned token has top priority as being the claimant.
            // For example, if a player is controlling themselves and a sidekick or
            // another, absent player, they can pick which one is making the claim.
            selectedOwnedToken?.actor?.uuid ||
            // If no owned token is selected, fall back to the user's assigned character.
            (game.user.character ? `Actor.${game.user.character.id}` : undefined);
        console.log('claimant', claimantUuid);
        if (!claimantUuid) {
            //console.log('No claimant available.  Tried user\'s character and a controlled token.');
            ui.notifications.error(game.i18n.localize(`${MODULE_CONFIG.name}.noClaimantAvailable`));
            return;
        }

        // check if this is a no-op
        // claimants will be a map of claimant actor ID -> claim type
        const hasExistingClaim = flags[claimantUuid] == claimType;
        if (hasExistingClaim) {
            //console.log('Skipping redundant claim.');
            return;
        }

        makeClaim(claimantUuid, claimType, item.uuid);
    }

    async _onDistributeLootClick(event) {
        if (!game.user.isGM) { ui.notifications.error("Only GM players can distribute loot."); return; }
        //if (!this.iamResponsibleGm) {
        if (!iamResponsibleGM()) {
            ui.notifications.error("Only the arbitrarily-chosen responsible GM can distribute loot.");
            return;
        }

        event.preventDefault();
        const element = event.currentTarget;
        const actor = this.actor;
        //console.log(actor);

        /* REM
        const uuid = <token>.actor.uuid;
        let document = await fromUuid(uuid);
        let actorData = document.data.actorData || document.data; // To ensure unlinked tokens resolve to the "same" thing as linked ones.

        note fromUuid on a client (non-GM?) returns an object.
        fromUuid on the stand-alone server GM yields an Actor5e (or token document if unlinked)
        */

        console.log('items:');
        for (const [lootedItemId, lootedItem] of this.actor.items.entries()) {
            // Skip items that've already been looted.
            if (lootedItem.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.lootedByKey)) continue;

            const needs = Object.entries(
                lootedItem.data.flags[MODULE_CONFIG.name] || {}
                )
                ?.filter(entry => entry[1] == MODULE_CONFIG.needKey)
                ?.map(entry => entry[0]);
            const greeds = Object.entries(
                lootedItem.data.flags[MODULE_CONFIG.name] || {}
                )
                ?.filter(entry => entry[1] == MODULE_CONFIG.greedKey)
                ?.map(entry => entry[0]);

            // Roll among the prioritized set of claimants (needs beat greeds).
            let claimantIds = needs.length > 0 ? needs : greeds;
            if (claimantIds.length <= 0) continue;

            const winnerUuid = uuidFromClaimFlag(claimantIds[Math.floor(Math.random() * claimantIds.length)]);
            console.log(winnerUuid, claimantIds);
            console.log('winner', winnerUuid);

            Item.create(lootedItem, {
                parent: claimant,
            });

            // TODO: Distribute all in one update.  Optimization, and prevents sheet flicker.
            await lootedItem.setFlag(MODULE_CONFIG.name, MODULE_CONFIG.lootedByKey, winnerUuid);
        }
    }
}
