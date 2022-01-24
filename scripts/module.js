import { CONFIG } from './config.js';
import { SimpleLootSheet } from './SimpleLootSheet.js';

/* Notes for later:
game.socket.emit('module.<module-name>', <object>);
game.socket.on('module.<module-name>', async (data) => { ...stuff... });
*/

/// Just need a single GM; doesn't matter who.  So find the active GM user with the lowest ID.
export function whoisResponsibleGM() {
    return game.users
        .filter(user => user.isGM && user.active)
        .reduce((prev, curr) => prev.id < curr.id ? prev : curr);
}

/// Am I a GM, and there exist no other active GMs with a lower ID than mine?
export function iamResponsibleGM() {
    return game.user.isGM &&
        whoisResponsibleGM().id == game.user.id;
}

export async function handleSocketGm(message, userSenderId) {
    console.log('handleSocketGm()');
    console.log('Got a socket event:', message);
    console.log('With userSenderId:', userSenderId);
    console.log('responsible GM is', whoisResponsibleGM());
    if (!iamResponsibleGM()) return;
    console.log("  I'm the responsible GM");

    switch (message.type) {
        // Set claim to the specified value, or clear it if they're the same.
        case CONFIG.messageTypes.CLAIM_REQUEST: {
            const {claimType, claimantActorId, itemUuid} = message;
            let item = await fromUuid(itemUuid);
            console.log('item being claimed', item);

            // Maybe we just use flags instead.  Since the stand-alone FVTT refreshing would restart the server and dump transient claims data.
            // A UUID like Scene.oGdObQ2fIetG64CD.Token.vzN7WxMXw6NlhpoA.Item.iBhjlawEB5iwUmoS can be used in two ways:
            // - await fromUuid('Scene.oGdObQ2fIetG64CD.Token.vzN7WxMXw6NlhpoA.Item.iBhjlawEB5iwUmoS')
            // - game.scenes.get('oGdObQ2fIetG64CD').tokens.get('vzN7WxMXw6NlhpoA').actor.items.get('iBhjlawEB5iwUmoS')
            if (item.getFlag(CONFIG.name, claimantActorId) == claimType) {
                console.log('UNSET claim');
                //await item.unsetFlag(CONFIG.name, claimantActorId);  // Exists.  Does nothing.
                item.setFlag(CONFIG.name, claimantActorId, CONFIG.passKey);
                //console.log('flag after unsetting claim', item.getFlag(CONFIG.name, claimantActorId));
            }
            else {
                console.log('SET claim');
                item.setFlag(CONFIG.name, claimantActorId, claimType);
            }
            break;
        }
    }
}

function handleSocket(message, senderUserId) {
    console.log('handleSocket() (non-GM)');
    console.log("IT'S WORKING!");
    console.log('message', message);
    console.log('sender user ID', senderUserId);
    const response = "h'lo";
    //socket.ack(response);
    //socket.broadcast.emit(CONFIG.socket, response);
    socket.emit(CONFIG.socket, response);
}

Hooks.once('init', async function() {
    console.log(`${CONFIG.name} | init`);
    //libWrapper.register('simple-loot-sheet-fvtt');

    // for the server-side
    // TODO: should this second param be async?
    /*
    game.socket.on(CONFIG.socket, (request, ack) => {
        console.log('SOCKET server got the message');
        const response = Object.merge(request, {
            type: 'claimResponse',
        });
        //ack(response);
        //game.socket.broadcast.emit(CONFIG.socket, response);
    });
    */

    // for all other clients (not the original requester)
    /*
    game.socket.on(CONFIG.socket, response => {
        // call the same response handler as the requesting client.
        // doSomethingWithResponse(response);
        console.log('SOCKET uninvolved client got the response');
    });
    */

    //Actors.registerSheet(CONFIG.ns, SimpleLootSheet, { makeDefault: false });
    switch (game.system.id) {
        // Add more system IDs here if the sheet is compatible with them.
        // Or add another case-break chunk to use a different sheet.
        case 'dnd5e': {
            Actors.registerSheet(game.system.id, SimpleLootSheet, { makeDefault: false });
            break;
        }
    }

    preloadHandlebarsTemplates();
    console.log(`${CONFIG.name} | init done`);
});

Hooks.once('ready', () => {
    console.log(`${CONFIG.name} | ready`);

    if (game.user.isGM)
        socket.on(CONFIG.socket, handleSocketGm);
    else
        socket.on(CONFIG.socket, handleSocket);

    /*
    // GM client listens
    if (game.user.isGM) {
        game.socket.on(CONFIG.socket, async (data) => {
            //if (!data || !data.hasOwnProperty('type')) return;

            console.log('MODULE SOCKET LISTEN - GM', data);
        });
    }
    else {
        game.socket.on(CONFIG.socket, async (data) => {
            //if (!data || !data.hasOwnProperty('type')) return;

            console.log('MODULE SOCKET LISTEN', data);
        });
    }
    */

    console.log(`${CONFIG.name} | ready done`);
});


// registerPartial was written by Lucas Straub#5006 on Foundry's Discord.
// https://discord.com/channels/170995199584108546/670336275496042502/781764805660770315
function registerPartial(name, path) {
    fetch(path)
    .then(function (response) {
        return response.text();
    })
    .then(function (text) {
      Handlebars.registerPartial(name, text);
    });
}
async function preloadHandlebarsTemplates() {
    const namedTemplatePaths = {
        claim: `modules/${CONFIG.name}/templates/player-claims.hbs`,
    };
    for (let name in namedTemplatePaths)
        registerPartial(name, namedTemplatePaths[name]);

    const templatePaths = [
        `modules/${CONFIG.name}/templates/loot-sheet.hbs`,
    ];
    return loadTemplates(templatePaths);
}
