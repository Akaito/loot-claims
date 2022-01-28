import { MODULE_CONFIG } from './config-lootClaims.js';
import { SimpleLootSheet } from './SimpleLootSheet.js';

import * as util from './util-lootClaims.js';
const log = util.log; // still want this short, convenient name

export class ClaimantClaim {
    // Future: allow claiming only some quantity.
    constructor(uuid, claimType, name, img) {
        // Required.
        this.uuid = uuid;
        this.claimType = claimType;
        // Extra for ease of use (mostly in Handlebars).
        this.name = name;
        this.img = img;
    }
}

/// Pass to an array's `.filter()` to unique-ify it.
///
/// From https://stackoverflow.com/questions/1960473/get-all-unique-values-in-a-javascript-array-remove-duplicates#14438954
export function unique(value, index, array) {
    /*
    if (typeof(value) === ClaimantClaim) {
        //return array.indexOf(array.find(c => c.uuid == value.uuid)) == index;
        value = array.find(c => c.uuid == value.uuid);
    }
    */
    return array.indexOf(value) == index;
}

/// Try using this like `SimpleLootSheet.reset(canvas.scene.tokens)` to reset everything in a scene.
///
/// target: Actor, Token, or Item.
export async function reset(actor, {prompt=true} = {}) {
    if (prompt === true) {
        if (await Dialog.confirm({
            title: MODULE_CONFIG.nameHuman,
            // TODO: Give more context.  Like one token, scene of tokens, number of tokens, etc.
            content: game.i18n.localize(`${MODULE_CONFIG.name}.confirmResetMessage`),
            defaultYes: false,
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
        ui.notifications.info(`((${MODULE_CONFIG.nameHuman}: Loot reset skipped player-owned character ${actor.name}.))`);
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
            log('generated-from:', ourFlags[MODULE_CONFIG.generatedFromKey]);
            if (ourFlags[MODULE_CONFIG.generatedFromKey]) {
                toBeDeleted.push(item.id);
                // TODO: Don't just reset loot like this, but remove it.  Keeping this here for now for quicker testing.
                //updates.push({'_id': item.id, [`flags.${MODULE_CONFIG.name}`]: null});
            }
            else {
                updates.push({_id: item.id, [`flags.${MODULE_CONFIG.name}`]: null});
            }
        }
    }
    //log('pushing updates', updates);
    await actor.updateEmbeddedDocuments('Item', updates);
    await actor.deleteEmbeddedDocuments('Item', toBeDeleted);
}

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

export function encodeUuidForFlag(uuid) {
    return uuid?.replaceAll('.', '~');
}
export function decodeUuidFromFlag(flag) {
    return flag?.replace('claim~','')?.replaceAll('~','.');
}
export function uuidFromClaimFlag(flag) {
    log('uuidFromClaimFlag', flag);
    return decodeUuidFromFlag(flag?.replace('claim~', ''));
}
export function claimFlagFromUuid(uuid) {
    return `claim~${encodeUuidForFlag(uuid)}`;
}

async function _handleClaimRequest(message, userSenderId) {
    log('_handleClaimRequest()');
    const {claimType, claimantUuids, itemUuid} = message;
    if (!Array.isArray(claimantUuids)) return;
    if (!MODULE_CONFIG.claimTypes.includes(claimType)) {
        console.error(MODULE_CONFIG.name, `Invalid claim type [${claimType}].  Not one of [${MODULE_CONFIG.claimTypes}].`);
        return;
    }

    let item = await fromUuid(itemUuid);
    log('item being claimed', item);
    // Don't allow changing claims after item has already been looted.
    log('already looted?', item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.lootedByKey));
    if (item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.lootedByKey)) return;

    let claims = item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.claimsKey) || [];
    let claimsChanged = false;
    for (let [claimantIndex, claimantUuid] of claimantUuids.entries()) {
        const claimant = await fromUuid(claimantUuid);
        if (!claimant) {
            conError(`Invalid claimant UUID skipped.  Nothing returned from fromUuid('${claimantUuid}')`);
            continue;
        }
        let existingClaim = claims.find(c => c.uuid == claimantUuid);
        if (existingClaim) {
            if (existingClaim.claimType == claimType) continue; // already as requested
            claims[claimantIndex].claimType = claimType;
            claimsChanged = true;
        }
        else {
            claims.push(new ClaimantClaim(
                claimantUuid,
                claimType,
                claimant.name,
                claimant.data?.img || claimant.actor?.img
            ));
            claimsChanged = true;
        }
    }
    //log('new claimant objects', claims);
    if (!claimsChanged) return;

    // Unique-ify the list of claims.  No-one gets to claim twice.
    claims = claims.reduce((ongoing, curr) => {
        if (!ongoing.find(claim => claim.uuid == curr.uuid))
            ongoing.push(curr);
        return ongoing;
    }, []);

    // Find other claim types this token may be trying for.

    // Update the item with the new claims.
    await item.setFlag(MODULE_CONFIG.name, claimType, claims);
    log(`item ${claimType} claimants set to`, item.getFlag(MODULE_CONFIG.name, claimType));

    for (let claimantUuid of claimantUuids) {
        const claimantFlagsKey = claimFlagFromUuid(claimantUuid);

        //flagUpdates

        /*
        // Maybe we just use flags instead.  Since the stand-alone FVTT refreshing would restart the server and dump transient claims data.
        // A UUID like Scene.oGdObQ2fIetG64CD.Token.vzN7WxMXw6NlhpoA.Item.iBhjlawEB5iwUmoS can be used in two ways:
        // - await fromUuid('Scene.oGdObQ2fIetG64CD.Token.vzN7WxMXw6NlhpoA.Item.iBhjlawEB5iwUmoS')
        // - game.scenes.get('oGdObQ2fIetG64CD').tokens.get('vzN7WxMXw6NlhpoA').actor.items.get('iBhjlawEB5iwUmoS')
        if (item.getFlag(MODULE_CONFIG.name, claimantFlagsKey) == claimType) {
            //log('UNSET claim');
            //await item.unsetFlag(MODULE_CONFIG.name, claimantActorUuid);  // Exists.  Does nothing.
            item.setFlag(MODULE_CONFIG.name, claimantFlagsKey, MODULE_CONFIG.passKey);
            //log('flag after unsetting claim', item.getFlag(MODULE_CONFIG.name, claimantActorUuid));
        }
        else {
            //log('SET claim');
            item.setFlag(MODULE_CONFIG.name, claimantFlagsKey, claimType);
        }
        */
    }
    return;
}

export async function handleSocketGm(message, userSenderId) {
    //log('handleSocketGm()');
    log('Got a socket event from', userSenderId, message);
    //log('responsible GM is', whoisResponsibleGM());
    if (!iamResponsibleGM()) return;
    //log("  I'm the responsible GM");

    switch (message.type) {
        // Set claim to the specified value, or clear it if they're the same.
        case MODULE_CONFIG.messageTypes.CLAIM_REQUEST: _handleClaimRequest(message, userSenderId); break;
    }
}

function handleSocket(message, senderUserId) {
    log('handleSocket() (non-GM)');
    log("IT'S WORKING!");
    log('message', message);
    log('sender user ID', senderUserId);
    const response = "h'lo";
    //socket.ack(response);
    //socket.broadcast.emit(MODULE_CONFIG.socket, response);
    socket.emit(MODULE_CONFIG.socket, response);
}

Hooks.once('init', async function() {
    log(`${MODULE_CONFIG.name} | init`);
    //libWrapper.register('simple-loot-sheet-fvtt');

    // for the server-side
    // TODO: should this second param be async?
    /*
    game.socket.on(MODULE_CONFIG.socket, (request, ack) => {
        log('SOCKET server got the message');
        const response = Object.merge(request, {
            type: 'claimResponse',
        });
        //ack(response);
        //game.socket.broadcast.emit(MODULE_CONFIG.socket, response);
    });
    */

    // for all other clients (not the original requester)
    /*
    game.socket.on(MODULE_CONFIG.socket, response => {
        // call the same response handler as the requesting client.
        // doSomethingWithResponse(response);
        log('SOCKET uninvolved client got the response');
    });
    */

    //Actors.registerSheet(MODULE_CONFIG.name, SimpleLootSheet, { makeDefault: false });
    switch (game.system.id) {
        // Add more system IDs here if the sheet is compatible with them.
        // Or add another case-break chunk to use a different sheet.
        case 'dnd5e': {
            Actors.registerSheet(MODULE_CONFIG.name, SimpleLootSheet, {
                label: 'simple-loot-sheet-fvtt.sheetName',
                makeDefault: false,
            });
            break;
        }
    }

    preloadHandlebarsTemplates();
    log('init done');
});

Hooks.once('ready', () => {
    log('ready');

    if (game.user.isGM)
        socket.on(MODULE_CONFIG.socket, handleSocketGm);
    else
        socket.on(MODULE_CONFIG.socket, handleSocket);

    window.SimpleLootSheet = MODULE_CONFIG.functions;

    console.log(...util.floc('myfootest', {arg: 2, blarg: 4}, 2*8, [1,2,3,4]));

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
