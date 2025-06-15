"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { LogOut, CalendarDays } from "lucide-react"
import { format } from "date-fns"
import clsx from "clsx"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, } from "@/components/ui/dialog"
import Skeleton, { SkeletonTheme } from "react-loading-skeleton"
import 'react-loading-skeleton/dist/skeleton.css'

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
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const router = useRouter()
  const [userBookings, setUserBookings] = useState<UserBooking[]>([])
  const [selectedBooking, setSelectedBooking] = useState<UserBooking | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  const handleViewDetails = (booking: UserBooking) => {
    setSelectedBooking(booking);
    setIsModalOpen(true);
    setAiResponse(''); // Clear previous AI response
    setIsStreaming(false); // Reset streaming status
  };

  const handlePlanMyDay = async () => {
    if (!selectedBooking) return;

    setIsStreaming(true);
    setAiResponse('');

    const prompt = `Plan a day for me based on this desk booking:
    Desk Name: ${selectedBooking.booking_details.desk_details.name}
    Description: ${selectedBooking.booking_details.desk_details.description}
    Floor: ${selectedBooking.booking_details.desk_details.floor_number}
    Capacity: ${selectedBooking.booking_details.desk_details.capacity}
    Slot Type: ${selectedBooking.booking_details.slot_details.type}
    Time: ${selectedBooking.booking_details.slot_details.start_time} - ${selectedBooking.booking_details.slot_details.end_time}
    Building: ${selectedBooking.booking_details.building_information.name}
    Address: ${selectedBooking.booking_details.building_information.address}, ${selectedBooking.booking_details.building_information.city}
    Price: $${selectedBooking.booking_details.pricing.price}
    Status: ${selectedBooking.status}
    Booked On: ${format(new Date(selectedBooking.updated_at), "PPPpp")}

    Please provide a concise plan, suggest activities around the booking time and location, and suggest a good lunch spot nearby.`;

    // Simulate API call and streaming response
    const dummyResponse = "Your day plan: \n\nMorning (8:00 AM - 12:00 PM): Arrive at the office, settle into your booked desk on Floor 3. Check emails and prepare for morning meetings.\n\nLunch (12:00 PM - 1:00 PM): Head to 'The Urban Spoon' cafe, just two blocks from your building. They have great sandwiches and fresh salads.\n\nAfternoon (1:00 PM - 5:00 PM): Focus on deep work at your desk. Schedule a quick 15-minute break around 3 PM to stretch. Attend any late afternoon virtual meetings.\n\nEvening (5:00 PM onwards): Wrap up your work. Consider a short walk around the city park nearby before heading home. ";

    for (let i = 0; i < dummyResponse.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 20)); // Simulate delay for streaming
      setAiResponse(prev => prev + dummyResponse[i]);
    }
    setIsStreaming(false);
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

  const handleQuickLogout = () => {
    logout()
    router.push("/login")
  }

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

  const getUserInitials = (name: string, email: string) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    }
    return email.charAt(0).toUpperCase()
  }

  const userInitials = user ? getUserInitials(user.name || user.email, user.email) : "";

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
          <DialogContent className="sm:max-w-full w-[95vw] max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Booking Details & Day Plan</DialogTitle>
              <DialogDescription>
                Full details of your desk booking and an AI-generated day plan.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col md:flex-row gap-6 py-4">
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
                      <p className="text-sm text-right capitalize">
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
              </div>

              {/* Right Half: Plan My Day AI Response */}
              <div className="flex-1 space-y-4 border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-6">
                <h4 className="font-semibold text-lg border-b pb-2 mb-2">Plan My Day (AI)</h4>
                {!aiResponse && !isStreaming ? (
                  <Button onClick={handlePlanMyDay} className="w-full">
                    Generate Day Plan
                  </Button>
                ) : (
                  <div>
                    {isStreaming ? (
                      <div className="flex items-center justify-center space-x-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                        <p className="text-muted-foreground">Generating plan...</p>
                      </div>
                    ) : null}
                    <p className="whitespace-pre-wrap text-sm text-gray-700">{aiResponse}</p>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </SkeletonTheme>
  )
}
