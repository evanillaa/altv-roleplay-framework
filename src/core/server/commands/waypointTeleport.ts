import * as alt from 'alt-server';
import { SYSTEM_EVENTS } from '../../shared/enums/system';
import { PERMISSIONS } from '../../shared/flags/PermissionFlags';
import { LOCALE_KEYS } from '../../shared/locale/languages/keys';
import { LocaleController } from '../../shared/locale/locale';
import { playerFuncs } from '../extensions/Player';
import ChatController from '../systems/chat';

ChatController.addCommand(
    'tp',
    LocaleController.get(LOCALE_KEYS.COMMAND_TELEPORT_WAYPOINT, '/tp'),
    PERMISSIONS.ADMIN,
    handleCommand
);

function handleCommand(player: alt.Player): void {
    if (!player.currentWaypoint) {
        playerFuncs.emit.message(player, `Önce bir tp konumu belirleyin ( P : Harita menüsü).`);
        return;
    }

    playerFuncs.safe.setPosition(player, player.currentWaypoint.x, player.currentWaypoint.y, player.currentWaypoint.z);
}
