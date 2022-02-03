import { MODULE_CONFIG } from './config-lootClaims.js';
import { ActorSheet_dnd5e } from './ActorSheet_dnd5e.js';
import { handleSocket, handleSocketGm } from './socket-lootClaims.js';
import * as util from './util-lootClaims.js';
const log = util.log; // still want this short, convenient name

/// Try using this like `LootClaims.reset(canvas.scene.tokens)` to reset everything in a scene.
/// (Other than linked actors.)
///
/// target: Actor, Token, or Item.
export async function reset(actor, {prompt=true} = {}) {
    if (prompt === true) {
        if (await Dialog.confirm({
            title: MODULE_CONFIG.title,
            // TODO: Give more context.  Like one token, scene of tokens, number of tokens, etc.
            content: game.i18n.localize(`${MODULE_CONFIG.name}.confirmResetMessage`),
            defaultYes: true,
            rejectClose: false,
        }) === true) {
            reset(actor, {prompt:false});
        }
        return;
    }

    // TODO: Update all at once, instead of one at a time.
    if (Array.isArray(actor)) {
        for (let a of actor) {
            await reset(a, {prompt:false});
        }
        return;
    }
    // Janky check to see if we've been given a Map.
    if (Array.isArray(actor?.contents)) {
        // TODO: Update them all at once.
        for (let a of actor) {
            await reset(a, {prompt:false});
        }
        return;
    }
    actor = actor?.actor || actor; // In case we were given a token.

    // Skip players' characters.
    if (actor.hasPlayerOwner) {
        ui.notifications.info(`((${MODULE_CONFIG.title}: Loot reset skipped player-owned character ${actor.name}.))`);
        return;
    }

    let items = actor?.items;
    if (!items) {
        ui.notifications.error(`((${MODULE_CONFIG.name}: Found no target to reset.  See console for what was attempted.))`);
        log(MODULE_CONFIG.name, "was asked to reset this thing it doesn't understand (has no .items):", actor);
        return;
    }

    let toBeDeleted = [];
    let updates = [];
    for (let item of items) {
        //log('should attempt reset on', item, item.name, item.data?.flags);
        const ourFlags = item.data?.flags[MODULE_CONFIG.name];
        if (ourFlags) {
            if (ourFlags[MODULE_CONFIG.generatedFromKey]) {
                toBeDeleted.push(item.id);
            }
            else {
                // Clear our module's flags from the item to "reset" it.
                updates.push({_id: item.id, [`flags.${MODULE_CONFIG.name}`]: null});
            }
        }
    }
    await actor.updateEmbeddedDocuments('Item', updates);
    await actor.deleteEmbeddedDocuments('Item', toBeDeleted);
}

/// We encode because otherwise a uuid, with periods here-and-there in it,
/// looks like an object when doing document updates.  It turns into a mess.
///
/// Tilde (~) is just an arbitrary choice of a character that's hopefully not allowed in UUIDs.
export function encodeUuidForFlag(uuid) {
    return uuid?.replaceAll('.', '~');
}
export function decodeUuidFromFlag(flag) {
    return flag?.replaceAll('~','.');
}

Hooks.once('init', async function() {
    log(`init`);
    //libWrapper.register('loot-claims');

    switch (game.system.id) {
        // Add more system IDs here if the sheet is compatible with them.
        // Or add another case-break chunk to use a different sheet.
        case 'dnd5e': {
            Actors.registerSheet(MODULE_CONFIG.name, ActorSheet_dnd5e, {
                label: 'loot-claims.sheetName', // localized for token config drop-down
                makeDefault: false,
            });
            break;
        }
    }

    // TODO: Settings registration.
    /*
    game.settings.register(MODULE_CONFIG.name, 'foo', {
        name: 'Foo',
        scope: 'world',
        default: {},
        type: Object,
        config: false,
        onChange: foo => {
            game.foo = foo;
        },
    });
    */

    preloadHandlebarsTemplates();
    log('init done');
});

Hooks.once('ready', () => {
    log('ready');

    if (game.user.isGM)
        socket.on(MODULE_CONFIG.socket, handleSocketGm);
    else
        socket.on(MODULE_CONFIG.socket, handleSocket);

    window.LootClaims = MODULE_CONFIG.functions;

    // Just testing our format/localize helper.
    //console.log(...util.floc('myfootest', {arg: 2, blarg: 4}, 2*8, [1,2,3,4]));

    log('ready done');
});


function _onResetSceneLootClick(html) {
    let sceneId = html.closest('[data-scene-id]').data('scene-id');
    MODULE_CONFIG.functions.reset(game.scenes.get(sceneId).tokens);
}

Hooks.on('getSceneNavigationContext', async (app, html, options) => {
    if (!game.user.isGM) return;

    // Add scene context menu item to reset loot (on tokens/actors within it).
    html.push({
        name: `${MODULE_CONFIG.name}.resetLoot`,
        icon: '<i class="fas fa-coins"></i>',
        callback: _onResetSceneLootClick,
        condition: _ => game.user.isGM,
    });
});


// registerPartial was found in a message by Lucas Straub#5006 on Foundry's Discord.
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
        claim: `modules/${MODULE_CONFIG.name}/templates/player-claims.hbs`,
    };
    for (let name in namedTemplatePaths)
        registerPartial(name, namedTemplatePaths[name]);

    const templatePaths = [
        `modules/${MODULE_CONFIG.name}/templates/loot-sheet.hbs`,
    ];
    return loadTemplates(templatePaths);
}
