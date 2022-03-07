import { MODULE_CONFIG } from './config-lootClaims.js';

export async function givePermission(tokens=undefined, players=undefined) {
    // Default to controlled tokens.
    if (!tokens) {
        tokens = canvas.tokens.controlled;
    }
    if ((tokens?.length || 0) < 0) return;

    // Default to all active players.
    if (!players) {
        players = game.users.filter(user => user.active);
    }
    if ((players?.length || 0) <= 0) return;
    // Make super sure we don't alter any GM permissions.
    players = players.filter(user => !user.isGM);

    let tokenIds = tokens.map(t=>t.id);
    let playerIds = players.map(u=>u.id);

    // Upgrade player permissions to Observer so they can see/use the sheet.
    // TODO: Try out Limited.
    //let actorUpdates = [];
    for (let token of tokens) {
        let permissions = {};
        Object.assign(permissions, token.actor.data.permission);
        for (let id of playerIds) {
            // Upgrade permissions.  Be sure we never lower them.
            permissions[id] = Math.max(2, permissions[id] ? Number(permissions[id]) : 0);
        }

        /*
        actorUpdates.push({
            _id: token.actor.id,
            permission: permissions
        });
        */

        await token.actor.update({
            permission: permissions,
        });
    }
    // TODO: Can these updates be done in bulk?  This line affects the base actor all the unlinked tokens share.
    //await Actor.updateDocuments(actorUpdates);

    // Mark tokens as lootable.
    await canvas.tokens.updateAll(
        {overlayEffect: 'icons/svg/chest.svg'},
        t => tokenIds.includes(t.id)
    );
}
