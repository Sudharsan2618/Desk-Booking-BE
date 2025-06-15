"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { CalendarDays } from "lucide-react"
import { format } from "date-fns"
import clsx from "clsx"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Skeleton, { SkeletonTheme } from "react-loading-skeleton"
import 'react-loading-skeleton/dist/skeleton.css'

interface Activity {
  time: string;
  title: string;
  details: string;
}

interface DayPlan {
  morning?: Activity[];
  afternoon?: Activity[];
  evening?: Activity[];
}

interface UserBooking {
  booking_id: string
  status: string
  updated_at: string
  booking_details: {
    desk_details: {
      name: string
      description: string
      floor_number: string
      capacity: number
    }
    slot_details: {
      type: string
      start_time: string
      end_time: string
    }
    building_information: {
      name: string
      address: string
      city: string
    }
    pricing: {
      price: number
    }
  }
}

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const [userBookings, setUserBookings] = useState<UserBooking[]>([])
  const [selectedBooking, setSelectedBooking] = useState<UserBooking | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [structuredDayPlan, setStructuredDayPlan] = useState<DayPlan | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  const handleViewDetails = (booking: UserBooking) => {
    setSelectedBooking(booking);
    setIsModalOpen(true);
    setStructuredDayPlan(null); // Clear previous AI response
    setAiError(null);
    setIsStreaming(false); // Reset streaming status
  };

  const handlePlanMyDay = async () => {
    if (!selectedBooking) return;

    setIsStreaming(true);
    setStructuredDayPlan(null);
    setAiError(null);

    const location = `${selectedBooking.booking_details.building_information.address}, ${selectedBooking.booking_details.building_information.city}`;
    const preferences = "tech-focused activities";

    try {
      const response = await fetch("http://localhost:5001/ai/day-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location,
          preferences,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get reader for streaming response.");
      }

      const decoder = new TextDecoder();
      let done = false;
      const contentFragments: string[] = []; // Accumulate content strings
      let incompleteLine = "";
      let hasCompleteObject = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        const chunk = decoder.decode(value, { stream: true });

        const lines = (incompleteLine + chunk).split(/\r?\n/);
        incompleteLine = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonPayload = line.substring("data: ".length).trim();
            if (jsonPayload) {
              try {
                const parsed = JSON.parse(jsonPayload);
                if (parsed.content !== undefined) {
                  contentFragments.push(parsed.content); // Add content to array
                } else if (parsed.complete !== undefined) {
                  setStructuredDayPlan(parsed.complete);
                  hasCompleteObject = true;
                  done = true; // Signal outer loop to stop
                  break; // Exit inner for loop (for this chunk's lines)
                }
              } catch (parseError) {
                console.warn("Could not parse JSON payload from line:", jsonPayload, parseError);
              }
            }
          }
        }

        if (hasCompleteObject) {
          break;
        }
      }

      // Only attempt final parsing if no 'complete' object was explicitly received
      // and if there's accumulated content.
      if (!hasCompleteObject && contentFragments.length > 0) {
        const fullJsonResponseString = contentFragments.join(''); // Join all fragments
        try {
          const parsedDayPlan: DayPlan = JSON.parse(fullJsonResponseString);
          setStructuredDayPlan(parsedDayPlan);
        } catch (parseError) {
          console.error("Error parsing final accumulated JSON response:", fullJsonResponseString, parseError);
          setAiError("Failed to parse AI response: Invalid JSON format.");
        }
      } else if (hasCompleteObject) {
          setAiError(null);
      }

    } catch (error) {
      console.error("Error fetching AI day plan:", error);
      setAiError(`Failed to generate day plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsStreaming(false);
    }
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login")
    } else if (isAuthenticated && user?.id) {
      const fetchUserBookings = async () => {
        try {
          const response = await fetch(
            `http://localhost:5000/api/desks/user-bookings?user_id=${user.id}`
          )
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
          const data = await response.json()
          setUserBookings(data.bookings || [])
        } catch (error) {
          console.error("Error fetching user bookings:", error)
        }
      }
      fetchUserBookings()
    }
  }, [isAuthenticated, isLoading, router, user?.id])

  if (isLoading) {
    return (
      <SkeletonTheme baseColor="#E5E7EB" highlightColor="#F9FAFB">
        <div className="flex-1 p-6 md:p-8 space-y-8">
          {/* Top Header Skeleton */}
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
            <div>
              <Skeleton height={36} width={200} className="mb-2" />
              <Skeleton height={20} width={250} />
            </div>
          </div>

          {/* Bookings Section Skeleton */}
          <div>
            <div className="flex items-center mb-4">
              <Skeleton circle height={20} width={20} className="mr-2" />
              <Skeleton height={24} width={180} />
            </div>
            <Skeleton height={15} width="70%" className="mb-6" />

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="border rounded-lg p-4 shadow-sm bg-white">
                  <Skeleton height={20} width="70%" className="mb-2" />
                  <Skeleton height={15} width="90%" className="mb-1" />
                  <Skeleton height={15} width="80%" className="mb-1" />
                  <Skeleton height={15} width="60%" className="mb-3" />
                  <Skeleton height={36} className="w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </SkeletonTheme>
    )
  }

  return (
    <SkeletonTheme baseColor="#E5E7EB" highlightColor="#F9FAFB">
      <div className="flex-1 p-6 md:p-8 space-y-8">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Dashboard</h2>
            <p className="text-muted-foreground mt-1">
              Welcome back, {user?.name || user?.email}!
            </p>
          </div>
        </div>

        {/* Bookings Section */}
        <div>
          <div className="flex items-center mb-4">
            <CalendarDays className="h-5 w-5 mr-2 text-muted-foreground" />
            <h3 className="text-xl font-semibold">Your Booked Desks</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            View your upcoming and past desk bookings.
          </p>

          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="border rounded-lg p-4 shadow-sm bg-white">
                  <Skeleton height={20} width="70%" className="mb-2" />
                  <Skeleton height={15} width="90%" className="mb-1" />
                  <Skeleton height={15} width="80%" className="mb-1" />
                  <Skeleton height={15} width="60%" className="mb-3" />
                  <Skeleton height={36} className="w-full" />
                </div>
              ))}
            </div>
          ) : userBookings.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {userBookings.map((booking) => (
                <div
                  key={booking.booking_id}
                  className="border rounded-lg p-4 shadow-sm bg-white hover:shadow-md transition"
                >
                  <div className="flex justify-between items-center mb-1">
                    <h4 className="font-semibold text-base">
                      {booking.booking_details.desk_details.name}
                    </h4>
                    <span
                      className={clsx(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        booking.status === "confirmed"
                          ? "bg-green-100 text-green-700"
                          : booking.status === "cancelled"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                      )}
                    >
                      {booking.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(booking.updated_at), "PP")} ·{" "}
                    {booking.booking_details.slot_details.start_time} -{" "}
                    {booking.booking_details.slot_details.end_time}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {booking.booking_details.building_information.name},{" "}
                    {booking.booking_details.building_information.city}
                  </p>
                  <p className="text-sm mt-2 font-medium">
                    Price: ${booking.booking_details.pricing.price}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => handleViewDetails(booking)}
                  >
                    Booking Details
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="border rounded-lg p-4 shadow-sm bg-white">
                  <Skeleton height={20} width="70%" className="mb-2" />
                  <Skeleton height={15} width="90%" className="mb-1" />
                  <Skeleton height={15} width="80%" className="mb-1" />
                  <Skeleton height={15} width="60%" className="mb-3" />
                  <Skeleton height={36} className="w-full" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Booking Details Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-full w-[95vw] h-[95vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Booking Details & Day Plan</DialogTitle>
              <DialogDescription>
                Full details of your desk booking and an AI-generated day plan.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-1 flex-col md:flex-row gap-6 py-4">
              {/* Left Half: Booking Details */}
              <div className="flex-1 space-y-4">
                <h4 className="font-semibold text-lg border-b pb-2 mb-2">Booking Information</h4>
                {selectedBooking && (
                  <div className="grid gap-2">
                    <div className="grid grid-cols-2 items-center gap-2">
                      <p className="text-sm font-medium">Desk Name:</p>
                      <p className="text-sm text-right">
                        {selectedBooking.booking_details.desk_details.name}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 items-center gap-2">
                      <p className="text-sm font-medium">Description:</p>
                      <p className="text-sm text-right">
                        {selectedBooking.booking_details.desk_details.description}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 items-center gap-2">
                      <p className="text-sm font-medium">Floor:</p>
                      <p className="text-sm text-right">
                        {selectedBooking.booking_details.desk_details.floor_number}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 items-center gap-2">
                      <p className="text-sm font-medium">Capacity:</p>
                      <p className="text-sm text-right">
                        {selectedBooking.booking_details.desk_details.capacity}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 items-center gap-2">
                      <p className="text-sm font-medium">Slot Type:</p>
                      <p className="text-sm text-right">
                        {selectedBooking.booking_details.slot_details.type}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 items-center gap-2">
                      <p className="text-sm font-medium">Time:</p>
                      <p className="text-sm text-right">
                        {selectedBooking.booking_details.slot_details.start_time} -{" "}
                        {selectedBooking.booking_details.slot_details.end_time}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 items-center gap-2">
                      <p className="text-sm font-medium">Building:</p>
                      <p className="text-sm text-right">
                        {selectedBooking.booking_details.building_information.name}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 items-center gap-2">
                      <p className="text-sm font-medium">Address:</p>
                      <p className="text-sm text-right">
                        {selectedBooking.booking_details.building_information.address},
                        {selectedBooking.booking_details.building_information.city}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 items-center gap-2">
                      <p className="text-sm font-medium">Price:</p>
                      <p className="text-sm text-right">
                        ${selectedBooking.booking_details.pricing.price}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 items-center gap-2">
                      <p className="text-sm font-medium">Status:</p>
                      <p className="text-sm text-right">
                        {selectedBooking.status}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 items-center gap-2">
                      <p className="text-sm font-medium">Booked On:</p>
                      <p className="text-sm text-right">
                        {format(new Date(selectedBooking.updated_at), "PPPpp")}
                      </p>
                    </div>
                  </div>
                )}
                <Button
                  onClick={handlePlanMyDay}
                  className="mt-4 w-full"
                  disabled={isStreaming}
                >
                  {isStreaming ? "Generating Day Plan..." : "Generate Day Plan"}
                </Button>
                {aiError && (
                  <div className="text-red-500 text-sm mt-2">
                    {aiError}
                  </div>
                )}
              </div>

              {/* Right Half: AI Day Plan */}
              <div className="flex-1 flex flex-col">
                <h4 className="font-semibold text-lg border-b pb-2 mb-4">Plan My Day (AI)</h4>
                <div className="flex-1 overflow-y-auto pr-2 min-h-0 max-h-[60vh]">
                  {isStreaming && !structuredDayPlan && (
                    <div className="space-y-2">
                      <Skeleton height={20} width="80%" />
                      <Skeleton height={20} width="90%" />
                      <Skeleton height={20} width="70%" />
                    </div>
                  )}

                  {!isStreaming && structuredDayPlan ? (
                    <div className="space-y-4">
                      {structuredDayPlan.morning && structuredDayPlan.morning.length > 0 && (
                        <div>
                          <h5 className="font-semibold text-md mb-2">Morning</h5>
                          {structuredDayPlan.morning.map((activity, index) => (
                            <div key={index} className="mb-2 p-2 border rounded-md">
                              <p className="font-medium">{activity.time}: {activity.title}</p>
                              <p className="text-sm text-muted-foreground">{activity.details}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {structuredDayPlan.afternoon && structuredDayPlan.afternoon.length > 0 && (
                        <div>
                          <h5 className="font-semibold text-md mb-2">Afternoon</h5>
                          {structuredDayPlan.afternoon.map((activity, index) => (
                            <div key={index} className="mb-2 p-2 border rounded-md">
                              <p className="font-medium">{activity.time}: {activity.title}</p>
                              <p className="text-sm text-muted-foreground">{activity.details}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {structuredDayPlan.evening && structuredDayPlan.evening.length > 0 && (
                        <div>
                          <h5 className="font-semibold text-md mb-2">Evening</h5>
                          {structuredDayPlan.evening.map((activity, index) => (
                            <div key={index} className="mb-2 p-2 border rounded-md">
                              <p className="font-medium">{activity.time}: {activity.title}</p>
                              <p className="text-sm text-muted-foreground">{activity.details}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    !isStreaming && !aiError && (
                      <p className="text-muted-foreground text-sm">
                        Click &apos;Generate Day Plan&apos; to get AI suggestions for your day..
                      </p>
                    )
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </SkeletonTheme>
  )
}
