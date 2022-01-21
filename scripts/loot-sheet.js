import { CONFIG } from './config.js';
import { iamResponsibleGM, handleSocketGm } from './module.js';

/// For the client to express interest in claiming an item (or passing on one).
///
/// References:
/// - https://discord.com/channels/170995199584108546/903652184003055677/903693659051008040
/// - https://discord.com/channels/170995199584108546/811676497965613117/903652184003055677
/// - https://discord.com/channels/170995199584108546/670336275496042502/835549329598840903
async function makeClaim(claimantActorId, claimType, itemUuid) {
    console.log('makeClaim()', claimantActorId, claimType, itemUuid);

    const message = {
        type: CONFIG.messageTypes.CLAIM_REQUEST,
        claimType,
        claimantActorId,
        itemUuid,
    };
    // TODO: Make this true only if we're the responsible GM.  Not just any GM.
    if (game.user.isGM) {
        await handleSocketGm(message, game.user.data._id);
    }
    else {
        new Promise(resolve => {
            const message = {
                type: CONFIG.messageTypes.CLAIM_REQUEST,
                claimType,
                claimantActorId,
                itemUuid,
            };
            // TODO: Move response to a function above this scope, so the GM user can call it, too?
            socket.emit(CONFIG.socket, message, response => {
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
            classes: [CONFIG.ns, 'sheet', 'actor'],
        });
    }

    get template() {
        return `modules/${CONFIG.name}/templates/loot-sheet.hbs`;
    }

    activateListeners(html) {
        html.find('.player-claims').click(this._onClaimClick.bind(this));
        html.find('.distribute-loot').click(this._onDistributeLootClick.bind(this));

        super.activateListeners(html);
    }

    getData() {
        let data = super.getData();
        data.CONFIG = CONFIG;

        data.isGM = game.user.isGM;
        data.iamResponsibleGM = iamResponsibleGM();

        // Add claims data in a different layout for the sake of Handlebars templating.
        data.claims = {};
        for (let item of this.actor.items) {
            data.claims[item.uuid] = {
                uuid: item.uuid,
                name: item.name,
                img: item.img,
                isStack: item.isStack,
                quantity: item.data.quantity,
                needs: [],
                greeds: [],
            };
            //console.log('item for hbs layout', item);
            const flags = item.data.flags[CONFIG.name];
            //console.log('item flags', flags);
            if (!flags) continue;

            for (const key of Object.keys(flags)) {
                const value = flags[key];
                let actor = game.actors.get(key);
                if (!actor) {
                    //console.log(`Skipping Actor ID in claims flags which didn't match an actor: ${key}`);
                    continue;
                }
                let claimant = {
                    actorId: key,
                    actorName: actor.name,
                    actorImg: actor.img,
                };
                switch (value) {
                    case CONFIG.needKey: data.claims[item.uuid].needs.push(claimant); break;
                    case CONFIG.greedKey: data.claims[item.uuid].greeds.push(claimant); break;
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
        let flags = item.getFlag(CONFIG.name, CONFIG.claimsKey) || {};
        //console.log('item', item);
        //console.log('flags', flags);

        const claimType = element.closest('.player-claims').dataset.claimType;

        // TODO: Improve this to check all controlled, and prioritize user's assigned character.
        //       Instead of just an actor ID, get a token UUID if at all possible.
        //       Though linked actors can still get by with just an actor ID.
        // Note: currently gets an actor ID; would a token ID work more universally?
        const claimantId =
            // players use their assigned actor
            game.actors.find(t => t.id == game.user.data.character)?.data?._id ||
            // else, GM (and potentially players) use an arbitrary selected token they control
            //game.canvas.tokens.controlled.find(t=>t.owner)?.id;
            game.canvas.tokens.controlled.find(t=>t.owner)?.data?.actorId;
        //console.log('claimant', claimantId);
        if (!claimantId) {
            //console.log('No claimant available.  Tried user\'s character and a controlled token.');
            return;
        }
        // TODO: Should this be ._id instead?
        //console.log('claimantId', claimantId);

        // check if this is a no-op
        // claimants will be a map of claimant actor ID -> claim type
        const hasExistingClaim = flags[claimantId] == claimType;
        if (hasExistingClaim) {
            //console.log('Skipping redundant claim.');
            return;
        }

        makeClaim(claimantId, claimType, item.uuid);
    }

    async _onDistributeLootClick(event) {
        if (!game.user.isGM) { ui.notifications.error("Only GM players can distribute loot."); return; }
        if (!iamResponsibleGm) {
            ui.notifications.error("Only the arbitrarily-chosen responsible GM can distribute loot.");
            return;
        }

        event.preventDefault();
        const element = event.currentTarget;
        const actor = this.actor;
        //console.log(actor);
    }
}
