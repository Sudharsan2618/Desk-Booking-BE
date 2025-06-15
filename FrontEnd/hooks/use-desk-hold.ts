import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";

export const useDeskHold = () => {
    const [heldBookingId, setHeldBookingId] = useState<string | null>(null);

    const releaseHold = useCallback(async () => {
        if (heldBookingId) {
            const bookingIdToRelease = heldBookingId;
            setHeldBookingId(null); // Clear immediately to prevent re-tries on subsequent calls

            try {
                const response = await fetch(`http://localhost:5000/api/desks/hold`, {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        booking_id: bookingIdToRelease,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Failed to release hold: ${errorData.error || response.statusText}`);
                }
                console.log(`Hold ${bookingIdToRelease} released successfully.`);
                toast.success("Held desk released.");
            } catch (error: any) {
                console.error("Error releasing hold:", error);
                toast.error(`Error releasing held desk: ${error.message}`);
            }
        }
    }, [heldBookingId]);

    // Add a beforeunload event listener to release the hold when the user closes the tab/browser
    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (heldBookingId) {
                // Note: Asynchronous operations are not guaranteed to complete during beforeunload.
                // A synchronous beacon or keepalive might be needed for critical cases.
                // For now, we'll just attempt the release.
                releaseHold();
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [heldBookingId, releaseHold]);

    return { heldBookingId, setHeldBookingId, releaseHold };
}; 