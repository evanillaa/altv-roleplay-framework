import * as alt from 'alt-server';
import { IStorage } from '../../shared/interfaces/IStorage';
import { playerFuncs } from '../extensions/Player';
import { StorageSystem } from '../systems/storage';
import { View_Events_Storage } from '../../shared/enums/views';
import { deepCloneObject } from '../../shared/utility/deepCopy';
import { Item } from '../../shared/interfaces/Item';
import { isFlagEnabled } from '../../shared/utility/flags';
import { ITEM_TYPE } from '../../shared/enums/itemTypes';

/**
 * Bind a player id to a storage container.
 * Removes binding on player disconnect.
 * @type { [id: string]: string }
 * */
let storageBinding: { [id: string]: string } = {};
let storageCache: { [id: number]: IStorage } = {};

export class StorageView {
    /**
     * Open storage for a specific container.
     * @static
     * @param {alt.Player} player
     * @param {string} id
     * @return {*}  {Promise<void>}
     * @memberof StorageView
     */
    static async open(player: alt.Player, storage_id: string, name: string): Promise<void> {
        if (StorageSystem.isRestricted(storage_id)) {
            playerFuncs.emit.notification(player, `~r~Storage in Use`);
            playerFuncs.emit.soundFrontend(player, 'Hack_Failed', 'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS');
            return;
        }

        StorageSystem.setRestricted(storage_id, true);
        const storage = await StorageSystem.get(storage_id);

        if (!storage) {
            playerFuncs.emit.notification(player, `~r~No Storage Available`);
            playerFuncs.emit.soundFrontend(player, 'Hack_Failed', 'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS');
            StorageSystem.setRestricted(storage_id, false);
            return;
        }

        // Push Storage Info Client-Side
        storageCache[player.id] = storage;
        StorageView.setStorageBinding(player.id, storage_id);
        alt.emitClient(player, View_Events_Storage.Open, storage_id, name, storage.items, player.data.inventory);
    }

    /**
     * Binds the storage instance to a player id.
     * @static
     * @param {number} id
     * @param {string} [storageID=null]
     * @return {*}
     * @memberof StorageView
     */
    static setStorageBinding(playerID: number, storageID: string) {
        storageBinding[playerID] = storageID;
    }

    /**
     * Removes the storage binding.
     * @static
     * @param {number} id
     * @return {*}
     * @memberof StorageView
     */
    static removeStorageBinding(playerID: number) {
        const storedStorageID = storageBinding[playerID];

        delete storageBinding[playerID];
        delete storageCache[playerID];

        if (!storedStorageID) {
            return;
        }

        StorageSystem.setRestricted(storedStorageID, false);
    }

    /**
     * Is the player id currently using a storage box?
     * @static
     * @param {alt.Player} player
     * @param {string} id
     * @return {*}  {boolean}
     * @memberof StorageView
     */
    static isMatchingStorageBinding(player: alt.Player, id: string): boolean {
        if (!storageBinding[player.id]) {
            return false;
        }

        if (storageBinding[player.id] !== id) {
            return false;
        }

        return true;
    }

    /**
     * Move item from the storage box to the player.
     * @static
     * @param {alt.Player} player
     * @memberof StorageView
     */
    static async moveFromStorage(player: alt.Player, id: string, index: number) {
        if (!id) {
            return;
        }

        if (!player || !player.valid) {
            StorageView.removeStorageBinding(player.id);
            StorageSystem.setRestricted(id, false);
            return;
        }

        if (!StorageView.isMatchingStorageBinding(player, id)) {
            StorageView.removeStorageBinding(player.id);
            StorageSystem.setRestricted(id, false);
            playerFuncs.emit.soundFrontend(player, 'Hack_Failed', 'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS');
            alt.emitClient(player, View_Events_Storage.Close);
            return;
        }

        // Check if the storage cache is set.
        if (!storageCache[player.id]) {
            StorageView.removeStorageBinding(player.id);
            StorageSystem.setRestricted(id, false);
            playerFuncs.emit.soundFrontend(player, 'Hack_Failed', 'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS');
            alt.emitClient(player, View_Events_Storage.Close);
            return;
        }

        // Check if the item exists.
        if (!storageCache[player.id].items[index]) {
            alt.emitClient(player, View_Events_Storage.Refresh, player.data.inventory, storageCache[player.id].items);
            return;
        }

        const openSlot = playerFuncs.inventory.getFreeInventorySlot(player);
        if (!openSlot) {
            playerFuncs.emit.notification(player, `Inventory is Full`);
            playerFuncs.emit.soundFrontend(player, 'Hack_Failed', 'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS');
            return;
        }

        const removedItem = storageCache[player.id].items.splice(index, 1)[0];
        if (!removedItem) {
            playerFuncs.emit.soundFrontend(player, 'Hack_Failed', 'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS');
            return;
        }

        // Remove, Update Database, Add to Inventory, Emit to Player
        const itemClone = deepCloneObject<Item>(removedItem);
        playerFuncs.inventory.inventoryAdd(player, itemClone, openSlot.slot, openSlot.tab);
        playerFuncs.save.field(player, 'inventory', player.data.inventory);
        playerFuncs.sync.inventory(player);

        await StorageSystem.update(storageCache[player.id]._id.toString(), { items: storageCache[player.id].items });
        alt.emitClient(player, View_Events_Storage.Refresh, player.data.inventory, storageCache[player.id].items);
        playerFuncs.emit.sound2D(player, 'item_shuffle_1', Math.random() * 0.45 + 0.1);
    }

    /**
     * Move an item from the player to the storage box.
     * @static
     * @param {alt.Player} player
     * @param {number} tab
     * @param {number} index
     * @memberof StorageView
     */
    static async moveFromPlayer(player: alt.Player, id: string, tab: number, index: number) {
        if (!id) {
            return;
        }

        if (!player || !player.valid) {
            StorageView.removeStorageBinding(player.id);
            StorageSystem.setRestricted(id, false);
            return;
        }

        if (!StorageView.isMatchingStorageBinding(player, id)) {
            StorageView.removeStorageBinding(player.id);
            StorageSystem.setRestricted(id, false);
            playerFuncs.emit.soundFrontend(player, 'Hack_Failed', 'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS');
            alt.emitClient(player, View_Events_Storage.Close);
            return;
        }

        if (!storageCache[player.id]) {
            StorageView.removeStorageBinding(player.id);
            StorageSystem.setRestricted(id, false);
            playerFuncs.emit.soundFrontend(player, 'Hack_Failed', 'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS');
            alt.emitClient(player, View_Events_Storage.Close);
            return;
        }

        if (!player.data.inventory[tab]) {
            alt.emitClient(player, View_Events_Storage.Refresh, player.data.inventory, storageCache[player.id].items);
            return;
        }

        if (!player.data.inventory[tab][index]) {
            alt.emitClient(player, View_Events_Storage.Refresh, player.data.inventory, storageCache[player.id].items);
            return;
        }

        const existingIndex = storageCache[player.id].items.findIndex(
            (x) =>
                x.name === player.data.inventory[tab][index].name &&
                isFlagEnabled(player.data.inventory[tab][index].behavior, ITEM_TYPE.CAN_STACK)
        );

        if (existingIndex <= -1 && storageCache[player.id].items.length + 1 > storageCache[player.id].maxSize) {
            alt.emitClient(player, View_Events_Storage.Refresh, player.data.inventory, storageCache[player.id].items);
            playerFuncs.emit.soundFrontend(player, 'Hack_Failed', 'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS');
            return;
        }

        const itemClone = deepCloneObject<Item>(player.data.inventory[tab][index]);
        if (!playerFuncs.inventory.inventoryRemove(player, player.data.inventory[tab][index].slot, tab)) {
            alt.emitClient(player, View_Events_Storage.Refresh, player.data.inventory, storageCache[player.id].items);
            return;
        }

        playerFuncs.save.field(player, 'inventory', player.data.inventory);
        playerFuncs.sync.inventory(player);

        // Stack if Possible
        if (existingIndex >= 0) {
            storageCache[player.id].items[existingIndex].quantity += itemClone.quantity;
        } else {
            storageCache[player.id].items.push(itemClone);
        }

        await StorageSystem.update(storageCache[player.id]._id.toString(), { items: storageCache[player.id].items });
        playerFuncs.emit.sound2D(player, 'item_shuffle_1', Math.random() * 0.45 + 0.1);
        alt.emitClient(player, View_Events_Storage.Refresh, player.data.inventory, storageCache[player.id].items);
    }

    /**
     * Called when a player closes a storage box.
     * @static
     * @param {alt.Player} player
     * @memberof StorageView
     */
    static close(player: alt.Player) {
        StorageView.removeStorageBinding(player.id);
    }
}

alt.onClient(View_Events_Storage.MoveFromPlayer, StorageView.moveFromPlayer);
alt.onClient(View_Events_Storage.MoveFromStorage, StorageView.moveFromStorage);
alt.onClient(View_Events_Storage.Close, StorageView.close);
