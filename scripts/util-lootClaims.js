import { MODULE_CONFIG } from './config-lootClaims.js';

/// Pass to an array's `.filter()` to unique-ify it.
///
/// From https://stackoverflow.com/questions/1960473/get-all-unique-values-in-a-javascript-array-remove-duplicates#14438954
export function unique(value, index, array) {
    return array.indexOf(value) == index;
}

/// "Format / LOCalize"
/// Can be called like `floc('some-loc-key', {formatStringFieldName='banana'})`.
/// Returns the formatted and/or localized message, and the unspent args.
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
    if (args?.length <= 0) return [result.message, ...result.args];

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
    let {locMessage, unspentArgs} = floc(message, ...args);
    if (unspentArgs?.length <= 0)
        printFunc(MODULE_CONFIG.name, '|', locMessage, ...unspentArgs);
    else
        printFunc(MODULE_CONFIG.name, '|', locMessage);
}

/// Can be called like `error('some-loc-key', {formatStringFieldName='banana'})`.
export function error(message, ...args) {
    conError(message, ...args);
    uiError(message, ...args);
}
export function conError(message, ...args) {
    _consolePrint(console.log, message, ...args);
}
export function uiError(message, ...args) {
    ui.notifications.error(`${MODULE_CONFIG.nameHuman} | ${floc(message, ...args)}`);
}

export function log(message, ...args) {
    console.log('log()', message, args);
    _consolePrint(console.log, message, ...args);
}
