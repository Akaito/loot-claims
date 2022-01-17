import { CONFIG } from './config.js';
import { SimpleLootSheet } from './loot-sheet.js';

/* Notes for later:
game.socket.emit('module.<module-name>', <object>);
game.socket.on('module.<module-name>', async (data) => { ...stuff... });
*/

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

Hooks.once('ready', async function() {
    console.log(`${CONFIG.name} | ready`);
    console.log(`${CONFIG.name} | ready done`);
});


// registerPartial was written by Lucas Straub#5006 on Foundry's Discord.
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
