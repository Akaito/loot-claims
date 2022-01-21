import { CONFIG } from './config.js';

/// For the client to express interest in claiming an item (or passing on one).
///
/// References:
/// - https://discord.com/channels/170995199584108546/903652184003055677/903693659051008040
/// - https://discord.com/channels/170995199584108546/811676497965613117/903652184003055677
/// - https://discord.com/channels/170995199584108546/670336275496042502/835549329598840903
async function makeClaim(claimantActorId, claimType, itemUuid) {
    /*
    return new Promise(resolve => {
        const requestData = {
            type: 'claimRequest',
            claimType,
            claimantActorId,
            itemUuid,
        };
        game.socket.emit(
            CONFIG.socket,
            requestData,
            responseData => {
                console.log('RESOLVED EMIT!!', responseData);
                //resolve(responseData);
                // call the same response handler as uninvolved clients.
                // doSomethingWithResponse(response);
            });
        console.log('SOCKET sent a request');
    });
    */

    console.log(claimantActorId, claimType, itemUuid);
    /*
    console.log('emit', game.socket.emit(CONFIG.socket, {
        type: 'claimRequest',
        claimType,
        claimantActorId,
        itemUuid,
    }));
    */

    if (game.user.isGM) {
        // Maybe we just use flags instead.  Since the stand-alone FVTT refreshing would restart the server and dump transient claims data.
        // A UUID like Scene.oGdObQ2fIetG64CD.Token.vzN7WxMXw6NlhpoA.Item.iBhjlawEB5iwUmoS can be used in two ways:
        // - await fromUuid('Scene.oGdObQ2fIetG64CD.Token.vzN7WxMXw6NlhpoA.Item.iBhjlawEB5iwUmoS')
        // - game.scenes.get('oGdObQ2fIetG64CD').tokens.get('vzN7WxMXw6NlhpoA').actor.items.get('iBhjlawEB5iwUmoS')
        let item = await fromUuid(itemUuid);
        console.log('item being claimed', item);
        item.setFlag(CONFIG.name, claimantActorId, claimType);
    }
    else {
        ui.notifications.warn("Sending claim request...");
        await new Promise(resolve => {
            socket.emit(CONFIG.socket, "I'm a request", response => {
                console.log('GOT A REQUEST RESPONSE!');
                console.log(res);
                ui.notifications.warn("Got request response!");
                resolve(response);
            });
        });
    }
}

export class SimpleLootSheet extends ActorSheet {

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 700,
            //height: 600,
            classes: [CONFIG.ns, 'sheet', 'actor'],
        });
    }

    get template() {
        return `modules/${CONFIG.name}/templates/loot-sheet.hbs`;
    }

    activateListeners(html) {
        html.find('.player-claims').click(this._onClaimClick.bind(this));

        super.activateListeners(html);
    }

    /*
    activateSocketListeners() {
        game.socket.on(CONFIG.socket, (data) => {
            console.log('SHEET SOCKET LISTEN', data);
        });
    }
    */

    getData() {
        let data = super.getData();
        data.CONFIG = CONFIG;

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
            console.log('item for hbs layout', item);
            const flags = item.data.flags[CONFIG.name];
            console.log('item flags', flags);
            if (!flags) continue;

            for (const key of Object.keys(flags)) {
                const value = flags[key];
                let actor = game.actors.get(key);
                if (!actor) {
                    console.log(`Skipping Actor ID in claims flags which didn't match an actor: ${key}`);
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

        console.log('CLAIMS laid out for hbs', data.claims);

        /*
        let flags = this.actor.data.flags[`${CONFIG.ns}`];
        if (flags) {
            // TODO: loop through, pushing player claim data into the local data object
        }
        */

        /*
        data.players = [];
        for (let player of game.users.players) {
            data.players.push(player);
        }
        */

        return data;
    }


    static _onSocket(o) {
        console.log('sheet _onSocket', o);
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
        console.log('item', item);
        console.log('flags', flags);

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
        console.log('claimant', claimantId);
        if (!claimantId) {
            console.log('No claimant available.  Tried user\'s character and a controlled token.');
            return;
        }
        // TODO: Should this be ._id instead?
        console.log('claimantId', claimantId);

        // check if this is a no-op
        // claimants will be a map of claimant actor ID -> claim type
        const hasExistingClaim = flags[claimantId] == claimType;
        if (hasExistingClaim) {
            console.log('Skipping redundant claim.');
            return;
        }

        makeClaim(claimantId, claimType, item.uuid);
    }
}
