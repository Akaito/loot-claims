import { MODULE } from './config.js';
import { LootSheet_dnd5e } from './loot-sheet.js';

/* Notes for later:
game.socket.emit('module.<module-name>', <object>);
game.socket.on('module.<module-name>', async (data) => { ...stuff... });
*/

Hooks.once('init', async function() {
    console.log(`${MODULE.name} | init`);
    //libWrapper.register('simple-loot-sheet-fvtt');

    Actors.registerSheet(MODULE.ns, LootSheet_dnd5e, { makeDefault: false });

    preloadHandlebarsTemplates();
    console.log(`${MODULE.name} | init done`);
});

Hooks.once('ready', async function() {
    console.log(`${MODULE.name} | ready`);
    console.log(`${MODULE.name} | ready done`);
});


// This function was written by Lucas Straub#5006 on Foundry's Discord.
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
        lootSheet: `modules/${MODULE.name}/templates/loot-sheet.hbs`,
    };
    for (let name in namedTemplatePaths)
        registerPartial(name, namedTemplatePaths[name]);
}
