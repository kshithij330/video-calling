import { createClient } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";

const client = createClient({
  // Use a public key from your Liveblocks dashboard
  // This is a placeholder; real-time sync needs a valid key.
  publicApiKey: "pk_dev_M40kZIerUUGrzhTzDQZvbIS_tsetnf8C-13hu8fofAFGB5kCVlSw09fxU6_uuzNQ",
});

// Presence: Used for real-time cursors and status
export const {
  suspense: {
    RoomProvider,
    useCanRedo,
    useCanUndo,
    useHistory,
    useMutation,
    useMyPresence,
    useOthers,
    useRoom,
    useSelf,
    useStorage,
    useUpdateMyPresence,
  },
} = createRoomContext(client);
