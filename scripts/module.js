import { CONFIG } from './config.js';
import { SimpleLootSheet } from './loot-sheet.js';

/* Notes for later:
game.socket.emit('module.<module-name>', <object>);
game.socket.on('module.<module-name>', async (data) => { ...stuff... });
*/

function handleSocket(event) {
    // Not a GM?  Do nothing.
    console.log('Got a socket event', event);
    if (!game.user.isGM) return;
    console.log("  I'm a GM");
    // Not the primary GM?  Do nothing.
    const gms = game.users
        .filter(user => user.isGM && user.active);
    // If we're the only GM, or we're the one with the highest ID, we're responsible.
    const isResponsibleGM = gms.length === 1 ||
        gms.some(other => other.data._id < game.user.data._id);
    if (!isResponsibleGM) return;
    console.log("  I'm the responsible GM");

    console.log("IT'S WORKING!");
    console.log(event);
    const response = "h'lo";
    ui.notifications.info("IT'S WORKING!");
    ack(response);
    socket.broadcast.emit(CONFIG.socket, response);
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
