import { MODULE_CONFIG } from './config-lootClaims.js';
import { iamResponsibleGM } from './socket-lootClaims.js';

/// Pass to an array's `.filter()` to unique-ify it.
///
/// From https://stackoverflow.com/questions/1960473/get-all-unique-values-in-a-javascript-array-remove-duplicates#14438954
export function unique(value, index, array) {
    return array.indexOf(value) == index;
}

/// "Format / LOCalize"
/// Can be called like `floc('some-loc-key', {formatStringFieldName='banana'})`.
/// Returns the formatted and/or localized message, and the provided args.
export function floc(message, ...args) {
    // Just a local object to help variable names make sense.
    // Could see this function changing later to directly return result.
    // But for now I like being able to pass `...floc(<stuff>)` to other functions.
    let result = {
        message,
        args,
    };

    if (!(typeof message == 'string' || message instanceof String)) return [result.message, ...result.args];
    //if (!game.i18n.has(message)) return [result.message, ...result.args];

    result.message = game.i18n.localize(message);
    if (args?.length <= 0) return [result.message];

    // TODO: Watch our key usage of args[0], and slice the returned args
    //       to not include it if we use every part of it while formatting?
    // This bit is mostly from inside Foundry's game.i18n.format().
    // Just needed to get more information out of the process, and change it up to handle more use cases.
    const pattern = /\{[^\}]+\}/g;
    result.message = result.message.replace(pattern, captured => {
        try {
            const messageArgName = captured.slice(1, -1);
            // Have to significantly change up how this works since we're not using the `data={}` arg style.
            for (let arg of args) {
                if (!(arg instanceof Object) || Array.isArray(arg)) continue;
                if (!Object.keys(arg).includes(messageArgName)) continue;

                return arg[messageArgName];
            }
        }
        catch (_) {}
        return captured;
    });
    return [result.message, ...result.args];
}

function _consolePrint(printFunc, message, ...args) {
    // TODO: Can we somehow get Firefox's console's right-side link to point where we want?
    //let caller_info = (new Error).stack.split('\n');
    //console.log(caller_info);
    let result = floc(message, ...args);
    printFunc(MODULE_CONFIG.emoji, MODULE_CONFIG.name, '|', ...result);
}

/// Can be called like `error('some-loc-key', {formatStringFieldName='banana'})`.
export function error(message, ...args) {
    conError(message, ...args);
    uiError(message, ...args);
}
export function conError(message, ...args) {
    _consolePrint(console.error, message, ...args);
}
export function uiError(message, ...args) {
    ui.notifications.error(`${MODULE_CONFIG.title} | ${floc(message, ...args)}`);
}

export function log(message, ...args) {
    _consolePrint(console.log, message, ...args);
}

/// @param {Array[Token5e]} [tokens=canvas.tokens.controlled]
/// @param {String} [newSheet='loot-claims.ActorSheet_dnd5e'] Registered name of an actor sheet class.
/// @param {Boolean} [ignorePlayerTokens=true] Even if asked to change sheets for player characters, don't.
export async function changeSheet({tokens=canvas.tokens.controlled, newSheet=`${MODULE_CONFIG.name}.ActorSheet_dnd5e`, ignorePlayerTokens=true}={}) {
    if (ignorePlayerTokens)
        tokens = tokens.filter(t => t.actor.type != 'pc');

    for (let token of tokens) {
        let priorState = token.actor?.sheet?._state;
        let priorPosition = token.actor?.sheet?.position;
        let promises = [];
        for (let app of Object.values(token.actor.apps)) {
            promises.push(app.close());
        }
        await Promise.all(promises);

        token.actor.apps = {};
        token.actor._sheet = null;
        await token.actor.setFlag('core', 'sheetClass', newSheet);

        // Re-open sheets which already were.
        if (priorState > 0) {
            if (priorPosition) {
                token.actor.sheet.render(true, {
                    left: priorPosition.left,
                    top: priorPosition.top
                });
            }
            else {
                token.actor.sheet.render(true);
            }
        }
    }
}

export async function toggleManualItemHide(item) {
    if (!game.user.isGM) { ui.notifications.error("Only GM players can distribute loot."); return; }
    if (!iamResponsibleGM()) {
        ui.notifications.error(game.i18n.localize('loot-claims.responsibleGmOnly'));
        return;
    }

    const hidden = item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.hiddenKey);
    // If already hidden, but not by manual GM intervention, don't unhide it manually, either.
    if (hidden && ((hidden?.length || 0) > 0) && hidden != MODULE_CONFIG.HIDDEN_REASON_GM) return;

    item.setFlag(MODULE_CONFIG.name, MODULE_CONFIG.hiddenKey, hidden == MODULE_CONFIG.HIDDEN_REASON_GM ? null : MODULE_CONFIG.HIDDEN_REASON_GM);
}
