import { MODULE_CONFIG } from './config-lootClaims.js';
import { ClaimantClaim } from './SimpleLootSheet.js';
import * as util from './util-lootClaims.js';
const log = util.log;

/// Just need a single GM; doesn't matter who.  So find the active GM user with the lowest ID.
function whoisResponsibleGM() {
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

export async function handleSocket(message, senderUserId) {
    /*
    log('handleSocket() (non-GM)');
    log("IT'S WORKING!");
    log('message', message);
    log('sender user ID', senderUserId);
    */
    //socket.ack(response);
    //socket.broadcast.emit(MODULE_CONFIG.socket, response);

    // Having this here caused an infinite run of messages back-and-forth when
    // more than one user was connected.  They kept taking turns sending "h'lo".
    //const response = "h'lo";
    //socket.emit(MODULE_CONFIG.socket, response);
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
    //log('item being claimed', item);
    // Don't allow changing claims after item has already been looted.
    //log('already looted?', item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.lootedByKey));
    if (item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.lootedByKey)) return;

    let claims = item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.claimsKey) || [];
    let claimsChanged = false;
    for (let [claimantIndex, claimantUuid] of claimantUuids.entries()) {
        const claimant = await fromUuid(claimantUuid);
        if (!claimant) {
            conError(`Invalid claimant UUID skipped.  Nothing returned from fromUuid('${claimantUuid}')`);
            continue;
        }
        let existingClaimIndex = claims.findIndex(c => c.uuid == claimantUuid);
        if (existingClaimIndex !== undefined && existingClaimIndex != -1) {
            if (claims[existingClaimIndex].claimType == claimType) {
                continue; // already as requested
            }
            claims[existingClaimIndex].claimType = claimType;
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
    if (!claimsChanged) return;

    // Unique-ify the list of claims.  No-one gets to claim twice.
    claims = claims.reduce((ongoing, curr) => {
        if (!ongoing.find(claim => claim.uuid == curr.uuid))
            ongoing.push(curr);
        return ongoing;
    }, []);

    // Find other claim types this token may be trying for.

    // Update the item with the new claims.
    await item.setFlag(MODULE_CONFIG.name, MODULE_CONFIG.claimsKey, claims);
    //log('item claimants set to', item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.claimsKey));
}
