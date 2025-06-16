"use client"

import { useEffect, useState, useCallback } from "react"
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
  const [bookingsLoading, setBookingsLoading] = useState<boolean>(true);
  const [streamingContent, setStreamingContent] = useState<string>("");

  const handleViewDetails = (booking: UserBooking) => {
    setSelectedBooking(booking);
    setIsModalOpen(true);
    setStructuredDayPlan(null); // Clear previous AI response
    setAiError(null);
    setIsStreaming(false); // Reset streaming status
  };

  const handleStreamingResponse = useCallback((data: any) => {
    if (data.content) {
      setStreamingContent(prev => prev + data.content);
    }
    if (data.complete) {
      setStructuredDayPlan(data.complete);
      setIsStreaming(false);
      setStreamingContent("");
    }
  }, []);

  const handlePlanMyDay = async () => {
    if (!selectedBooking) return;

    setIsStreaming(true);
    setStructuredDayPlan(null);
    setAiError(null);
    setStreamingContent(""); // Reset streaming content

    const location = `${selectedBooking.booking_details.building_information.address}, ${selectedBooking.booking_details.building_information.city}`;
    const preferences = "tech-focused activities";

    // Prepare booking details for the AI
    const bookingContext = {
        deskDetails: {
            name: selectedBooking.booking_details.desk_details.name,
            description: selectedBooking.booking_details.desk_details.description,
            floor: selectedBooking.booking_details.desk_details.floor_number,
            capacity: selectedBooking.booking_details.desk_details.capacity
        },
        slotDetails: {
            type: selectedBooking.booking_details.slot_details.type,
            startTime: selectedBooking.booking_details.slot_details.start_time,
            endTime: selectedBooking.booking_details.slot_details.end_time
        },
        buildingDetails: {
            name: selectedBooking.booking_details.building_information.name,
            address: selectedBooking.booking_details.building_information.address,
            city: selectedBooking.booking_details.building_information.city
        },
        bookingDate: format(new Date(selectedBooking.updated_at), "yyyy-MM-dd")
    };

    try {
        const response = await fetch("http://localhost:5001/ai/day-plan", { // Changed port to 5001
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                location,
                preferences,
                bookingContext
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
            throw new Error("Failed to get reader for streaming response");
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        handleStreamingResponse(data);
                    } catch (e) {
                        console.error('Error parsing streaming data:', e);
                        setAiError("Error parsing AI response. Please try again.");
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error fetching day plan:', error);
        setAiError(error instanceof Error ? error.message : "Failed to generate day plan. Please try again.");
        setIsStreaming(false);
        setStreamingContent("");
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
        } finally {
          setBookingsLoading(false);
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

          {bookingsLoading ? (
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
            <p className="text-muted-foreground text-center py-8">
              You didn&apos;t have any booking currently.
            </p>
          )}
        </div>

        {/* Booking Details Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-full w-[100vw] h-[100vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Booking Details & Day Plan</DialogTitle>
              <DialogDescription>
                Full details of your desk booking and an AI-generated day plan.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-1 flex-col md:flex-row gap-6 py-4 overflow-hidden">
              {/* Left Half: Booking Details */}
              <div className="flex-1 overflow-hidden">
                <div className="bg-card rounded-lg border shadow-sm p-6 h-full flex flex-col">
                  <h4 className="font-semibold text-lg mb-4 text-primary">Booking Information</h4>
                  <div className="flex-1 overflow-y-auto pr-2">
                    {selectedBooking && (
                      <div className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Desk Name</p>
                            <p className="text-sm font-semibold mt-1">
                              {selectedBooking.booking_details.desk_details.name}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Floor</p>
                            <p className="text-sm font-semibold mt-1">
                              {selectedBooking.booking_details.desk_details.floor_number}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Slot Type</p>
                            <p className="text-sm font-semibold mt-1">
                              {selectedBooking.booking_details.slot_details.type}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Time</p>
                            <p className="text-sm font-semibold mt-1">
                              {selectedBooking.booking_details.slot_details.start_time} -{" "}
                              {selectedBooking.booking_details.slot_details.end_time}
                            </p>
                          </div>
                        </div>

                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-sm font-medium text-muted-foreground">Description</p>
                          <p className="text-sm mt-1">
                            {selectedBooking.booking_details.desk_details.description}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Building</p>
                            <p className="text-sm font-semibold mt-1">
                              {selectedBooking.booking_details.building_information.name}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Capacity</p>
                            <p className="text-sm font-semibold mt-1">
                              {selectedBooking.booking_details.desk_details.capacity}
                            </p>
                          </div>
                        </div>

                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-sm font-medium text-muted-foreground">Address</p>
                          <p className="text-sm mt-1">
                            {selectedBooking.booking_details.building_information.address},{" "}
                            {selectedBooking.booking_details.building_information.city}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Price</p>
                            <p className="text-sm font-semibold mt-1">
                              ${selectedBooking.booking_details.pricing.price}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Status</p>
                            <p className="text-sm font-semibold mt-1">
                              {selectedBooking.status}
                            </p>
                          </div>
                        </div>

                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-sm font-medium text-muted-foreground">Booked On</p>
                          <p className="text-sm mt-1">
                            {format(new Date(selectedBooking.updated_at), "PPPpp")}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="mt-6">
                    <Button
                      onClick={handlePlanMyDay}
                      className="w-full"
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
                </div>
              </div>

              {/* Right Half: AI Day Plan */}
              <div className="flex-1 overflow-hidden">
                <div className="bg-card rounded-lg border shadow-sm p-6 h-full flex flex-col">
                  <h4 className="font-semibold text-lg mb-4 text-primary">Plan My Day With AI</h4>
                  <div className="flex-1 overflow-y-auto pr-2">
                    {isStreaming && (
                      <div className="space-y-4">
                        <div className="bg-muted/50 p-4 rounded-lg">
                          <pre className="whitespace-pre-wrap font-mono text-sm">
                            {streamingContent}
                          </pre>
                        </div>
                      </div>
                    )}

                    {!isStreaming && structuredDayPlan ? (
                      <div className="space-y-6">
                        {structuredDayPlan.morning && structuredDayPlan.morning.length > 0 && (
                          <div>
                            <h5 className="font-semibold text-md mb-4 text-primary">Morning</h5>
                            <div className="relative pl-8 space-y-4">
                              {structuredDayPlan.morning.map((activity, index) => (
                                <div key={index} className="relative">
                                  <div className="absolute left-[-32px] top-2 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                                    <div className="w-3 h-3 rounded-full bg-primary"></div>
                                  </div>
                                  {index < (structuredDayPlan.morning?.length ?? 0) - 1 && (
                                    <div className="absolute left-[-20px] top-8 w-0.5 h-[calc(100%+1rem)] bg-primary/20"></div>
                                  )}
                                  <div className="bg-muted/50 p-4 rounded-lg">
                                    <p className="font-medium text-primary">{activity.time}</p>
                                    <h6 className="font-semibold mt-1">{activity.title}</h6>
                                    <p className="text-sm text-muted-foreground mt-2">{activity.details}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {structuredDayPlan.afternoon && structuredDayPlan.afternoon.length > 0 && (
                          <div>
                            <h5 className="font-semibold text-md mb-4 text-primary">Afternoon</h5>
                            <div className="relative pl-8 space-y-4">
                              {structuredDayPlan.afternoon.map((activity, index) => (
                                <div key={index} className="relative">
                                  <div className="absolute left-[-32px] top-2 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                                    <div className="w-3 h-3 rounded-full bg-primary"></div>
                                  </div>
                                  {index < (structuredDayPlan.afternoon?.length ?? 0) - 1 && (
                                    <div className="absolute left-[-20px] top-8 w-0.5 h-[calc(100%+1rem)] bg-primary/20"></div>
                                  )}
                                  <div className="bg-muted/50 p-4 rounded-lg">
                                    <p className="font-medium text-primary">{activity.time}</p>
                                    <h6 className="font-semibold mt-1">{activity.title}</h6>
                                    <p className="text-sm text-muted-foreground mt-2">{activity.details}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {structuredDayPlan.evening && structuredDayPlan.evening.length > 0 && (
                          <div>
                            <h5 className="font-semibold text-md mb-4 text-primary">Evening</h5>
                            <div className="relative pl-8 space-y-4">
                              {structuredDayPlan.evening.map((activity, index) => (
                                <div key={index} className="relative">
                                  <div className="absolute left-[-32px] top-2 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                                    <div className="w-3 h-3 rounded-full bg-primary"></div>
                                  </div>
                                  {index < (structuredDayPlan.evening?.length ?? 0) - 1 && (
                                    <div className="absolute left-[-20px] top-8 w-0.5 h-[calc(100%+1rem)] bg-primary/20"></div>
                                  )}
                                  <div className="bg-muted/50 p-4 rounded-lg">
                                    <p className="font-medium text-primary">{activity.time}</p>
                                    <h6 className="font-semibold mt-1">{activity.title}</h6>
                                    <p className="text-sm text-muted-foreground mt-2">{activity.details}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      !isStreaming && !aiError && (
                        <p className="text-muted-foreground text-sm">
                          Click &apos;Generate Day Plan&apos; to get AI suggestions for your day.
                        </p>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </SkeletonTheme>
  )
}
