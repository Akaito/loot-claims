import { MODULE_CONFIG } from './config-lootClaims.js';
import { encodeUuidForFlag } from './module-lootClaims.js';

/// Deliberately doesn't cache/memoize its found items.  So someone can try
/// things out, then realize they want to import or otherwise make their own
/// compatible currencies.  We want to find those when that happens, instead of
/// in-memory-caching whatever we hit first.
/// Maybe setup some settings options in the future?
export async function findCurrencyItem(currencyShortName) {
    // First, check if there's already a currency item in the world for us to use.
    let itemName = game.i18n.localize(`${MODULE_CONFIG.name}.currency-${currencyShortName}`);
    let item = game.items.find(i => i.name == itemName);
    if (item)
        return item;

    // Future: Do something fancier to auto-discover custom packs?
    // Others could always replace this function, but not everyone's comfortable doing that sort of thing.
    let pack = await game.packs.get(`${MODULE_CONFIG}.currency-${game.system.id}`);
    if (!pack)
        pack = await game.packs.get(`${MODULE_CONFIG}.currency-dnd5e`);
    if (!pack)
        return null;

    let packItems = await pack.getDocuments();
    item = packItems.find(i => i.name == itemName);
    return item || null;
}

/// Just adds items equivalent to data.data.currency object values.
/// Does not remove existing real currency!
export async function addCurrencyItems(tokens) {
    let memoizedCurrencies = new Map;
    for (let token of tokens) {
        let actorCurrency = token.actor.data.data.currency;
        let currencyShortStrings = Object.keys(actorCurrency);
        if (!currencyShortStrings) return; // TODO: Better handling of missing currency data (dnd5e or otherwise).

        let itemUpdates = [];
        let newItems = [];
        for (let short of currencyShortStrings) {
            if (Number(actorCurrency[short] || 0) <= 0) continue;

            let item = memoizedCurrencies[short] || undefined;
            if (!item) {
                item = await MODULE_CONFIG.functions.findCurrencyItem(short) || undefined;
                if (item) {
                    item = duplicate(item);
                    memoizedCurrencies[short] = item;
                }
            }
            if (!item) continue; // TODO: Error message on missing currency item.
            console.log('using currency item:', item);

            const existingItem = token.actor.getEmbeddedCollection('Item').find(actorItem => actorItem.type == item.type && actorItem.name == item.name);
            // TODO: Sanity-check data structure of existing item first.  Do that sort of thing in a few places in this module.
            if (existingItem) {
                console.log('CURRENCY ALREADY EXISTS');
                itemUpdates.push({
                    _id: existingItem.id,
                    data: {
                        quantity: Number(existingItem.data.data.quantity) + Number(actorCurrency[short]),
                    },
                });
            }
            else {
                console.log('NEW CURRENCY');
                newItems.push({
                    ...item,
                    data: {
                        // Expect item's quantity is 1.  But just in case someone's doing something funky.
                        quantity: Number(item.data.quantity || 1) * Number(actorCurrency[short]),
                    },
                    flags: {
                        [MODULE_CONFIG.name]: {
                            // TODO: Does this 'uuid' format work equally well for both world and pack/compendium items?
                            [MODULE_CONFIG.generatedFromKey]: encodeUuidForFlag('Item.' + item._id),
                        },
                    },
                });
                //console.log('FLAG CHECK', MODULE_CONFIG.generatedFromKey, item.uuid, item.id, encodeUuidForFlag('Item.' + item._id));
            }
        }

        console.log(itemUpdates);
        console.log(newItems);
        await Item.createDocuments(newItems, {
            parent: token.actor,
        });
    }
}
