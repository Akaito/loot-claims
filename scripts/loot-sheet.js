import { CONFIG } from './config.js';

/// For the client to express interest in claiming an item (or passing on one).
///
/// References:
/// - https://discord.com/channels/170995199584108546/903652184003055677/903693659051008040
/// - https://discord.com/channels/170995199584108546/811676497965613117/903652184003055677
/// - https://discord.com/channels/170995199584108546/670336275496042502/835549329598840903
/*async*/ function makeClaim(claimantActorId, claimType, itemUuid) {
    console.log('makeClaim() called');
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
    game.socket.emit(CONFIG.socket, {
        type: 'claimRequest',
        claimType,
        claimantActorId,
        itemUuid,
    });
}

export class SimpleLootSheet extends ActorSheet {

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            //width: 800,
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
        console.log(o);
    }


    _onClaimClick(event) {
        event.preventDefault();
        let element = event.currentTarget;
        let itemId = element.closest('.item').dataset.itemId;
        //let item = this.actor.getOwnedItem(itemId);
        let item = this.actor.getEmbeddedDocument('Item', itemId, {strict:false});
        // TODO: FUTURE: Don't use flags, since they're stored in the DB.  Use transient memory.
        let flags = item.getFlag(CONFIG.name, 'claims') || {};
        console.log('item', item);
        console.log('flags', flags);

        const claimType = element.closest('.player-claims').dataset.claimType;

        // TODO: Improve this to check all controlled, and prioritize user's assigned character.
        //       Instead of just an actor ID, get a token UUID if at all possible.
        //       Though linked actors can still get by with just an actor ID.
        const claimantActor =
            // players
            game.user.data.character ||
            // GM (and potentially players)
            game.canvas.tokens.controlled[0];
        console.log('claimant', claimantActor);
        if (!claimantActor) {
            console.log('No claimant available.  Tried user\'s character and a controlled token.');
            return;
        }
        // TODO: Should this be ._id instead?
        const claimantActorId = claimantActor.data.actorId;
        console.log('claimantActorId', claimantActorId);

        // check if this is a no-op
        // claimants will be a map of claimant actor ID -> claim type
        const hasExistingClaim = flags[claimantActorId] == claimType;
        if (hasExistingClaim) {
            console.log('Skipping redundant claim.');
            return;
        }

        makeClaim(claimantActorId, claimType, item.uuid);
    }
}
