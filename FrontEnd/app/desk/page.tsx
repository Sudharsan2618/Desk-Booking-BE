"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import io from "socket.io-client";
import { ArrowRight, Calendar, MapPin, Clock, Users, Wifi, Coffee, Monitor, Building, CheckCircle, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import toast from "react-hot-toast";

interface DeskType {
    capacity: number;
    desk_type_id: number;
    type: string;
}

interface Location {
    location_id: string;
    location_name: string;
}

interface Slot {
    end_time: string;
    slot_id: number;
    slot_type: string;
    start_time: string;
    time_zone: string;
    status: string;
    price: number;
}

// Helper function to safely render amenities
const renderAmenities = (amenities: string[] | Record<string, boolean> | string | null | undefined) => {
    if (Array.isArray(amenities)) {
        return amenities.join(", ");
    } else if (typeof amenities === 'object' && amenities !== null) {
        const amenityStrings = Object.entries(amenities)
            .filter(([, value]) => value === true)
            .map(([key]) => key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()));
        return amenityStrings.length > 0 ? amenityStrings.join(", ") : "N/A";
    } else if (amenities) {
        return String(amenities);
    }
    return "N/A";
};

// Helper function to safely render operating hours
const renderOperatingHours = (operatingHours: string | { open: string; close: string; }) => {
    if (typeof operatingHours === 'object' && operatingHours !== null && 'open' in operatingHours && 'close' in operatingHours) {
        return `${operatingHours.open} - ${operatingHours.close}`;
    } else if (typeof operatingHours === 'string') {
        return operatingHours;
    }
    return "N/A";
};

// Helper function to get amenity icon
const getAmenityIcon = (amenity: string) => {
    const amenityLower = amenity.toLowerCase();
    if (amenityLower.includes('wifi') || amenityLower.includes('internet')) return <Wifi className="h-4 w-4" />;
    if (amenityLower.includes('coffee') || amenityLower.includes('kitchen')) return <Coffee className="h-4 w-4" />;
    if (amenityLower.includes('monitor') || amenityLower.includes('screen')) return <Monitor className="h-4 w-4" />;
    return <CheckCircle className="h-4 w-4" />;
};

interface Desk {
    desk_id: string;
    desk_name: string;
    floor_number: string;
    capacity: number;
    description: string;
    desk_status: string;
    building_name: string;
    building_address: string;
    amenities: string[];
    operating_hours: string | { open: string; close: string; };
    city: string;
    slots: Slot[];
}

export default function DeskBookingPage() {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();

    const [deskTypes, setDeskTypes] = useState<DeskType[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [slots, setSlots] = useState<Slot[]>([]);
    const [availableDesks, setAvailableDesks] = useState<Desk[]>([]);

    const [selectedDeskType, setSelectedDeskType] = useState<string>("");
    const [selectedLocation, setSelectedLocation] = useState<string>("");
    const [selectedSlot, setSelectedSlot] = useState<string>("");
    const [selectedBookingDate, setSelectedBookingDate] = useState<Date>(new Date());
    const [heldBookingId, setHeldBookingId] = useState<string | null>(null);
    const [modalSelectedSlot, setModalSelectedSlot] = useState<string | null>(null);
    const [heldDeskId, setHeldDeskId] = useState<string | null>(null);
    const [heldSlotId, setHeldSlotId] = useState<string | null>(null);

    const [selectedDesk, setSelectedDesk] = useState<Desk | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [connectionStatus, setConnectionStatus] = useState<string>("Disconnected");

    const socket = useRef<any>(null);

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const [desksPerPage] = useState(6);

    const userId = "4f322373-16c4-4fb2-9f05-07c264ba2153"; // Placeholder: Replace with actual user ID from authentication context

    const emitFilterChanges = useCallback(() => {
        if (!socket.current) return;

        const filters = {
            location_ids: selectedLocation ? [selectedLocation] : [],
            desk_type_ids: selectedDeskType ? [selectedDeskType] : [],
            slot_type_ids: selectedSlot ? [selectedSlot] : [],
            booking_date: selectedBookingDate ? selectedBookingDate.toISOString().split('T')[0] : null,
        };
        console.log('Emitting filter change:', filters);
        socket.current.emit('filter_update', filters);
    }, [selectedLocation, selectedDeskType, selectedSlot, selectedBookingDate]);

    const fetchMasterData = useCallback(async () => {
        try {
            const response = await fetch("http://localhost:5000/api/master-data");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setDeskTypes(data.desk_types || []);
            setLocations(data.locations || []);
            setSlots(data.slots || []);
        } catch (error: any) {
            console.error("Error fetching master data:", error);
            toast.error(`Failed to load master data: ${error.message}. Please refresh the page.`);
        }
    }, [toast]);

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push("/login");
        }
    }, [isAuthenticated, isLoading, router]);

    useEffect(() => {
        fetchMasterData();

        if (!socket.current) {
            socket.current = io('http://localhost:5000', {
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000,
                transports: ['websocket', 'polling']
            });
        }

        const currentSocket = socket.current;

        currentSocket.on('connect', () => {
            console.log('Connected to WebSocket');
            setConnectionStatus('Connected');
            emitFilterChanges();
        });

        currentSocket.on('disconnect', () => {
            console.log('Disconnected from WebSocket');
            setConnectionStatus('Disconnected');
        });

        currentSocket.on('connect_error', (error: any) => {
            console.error('Connection error:', error);
            setConnectionStatus('Connection Error');
            toast.error(`WebSocket connection error: ${error.message}.`);
        });

        currentSocket.on('reconnect_attempt', (attemptNumber: number) => {
            console.log('Reconnection attempt:', attemptNumber);
            setConnectionStatus(`Reconnecting (${attemptNumber})...`);
            toast(`Reconnecting to server (attempt ${attemptNumber})...`, { icon: '⏳' });
        });

        currentSocket.on('reconnect', (attemptNumber: number) => {
            console.log('Reconnected after', attemptNumber, 'attempts');
            setConnectionStatus('Connected');
            toast.success('Reconnected to server!');
            emitFilterChanges();
        });

        currentSocket.on('desk_update', (data: { desks: Desk[] }) => {
            console.log('Received desk update:', data);
            setAvailableDesks(data.desks || []);
            setCurrentPage(1);
        });

        const heartbeatInterval = setInterval(() => {
            if (currentSocket.connected) {
                currentSocket.emit('ping');
            }
        }, 30000);

        return () => {
            if (currentSocket) {
                currentSocket.off('connect');
                currentSocket.off('disconnect');
                currentSocket.off('connect_error');
                currentSocket.off('reconnect_attempt');
                currentSocket.off('reconnect');
                currentSocket.off('desk_update');
            }
            clearInterval(heartbeatInterval);
        };
    }, [emitFilterChanges, fetchMasterData, toast]);

    useEffect(() => {
        if (!isLoading && isAuthenticated) {
            emitFilterChanges();
        }
        setHeldBookingId(null);
        setHeldDeskId(null);
        setHeldSlotId(null);
        setModalSelectedSlot(null);
    }, [selectedDeskType, selectedLocation, selectedSlot, selectedBookingDate, isAuthenticated, isLoading, emitFilterChanges]);

    if (isLoading || !isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
                <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-6"></div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">Loading Desk Booking</h3>
                    <p className="text-gray-600">Preparing your workspace experience...</p>
                </div>
            </div>
        );
    }

    const handleBooking = async (deskId: string) => {
        if (!deskId || !modalSelectedSlot || !heldBookingId) {
            toast.error("Please select a desk and a time slot first (and ensure it's held).");
            return;
        }

        const currentUserId = "4f322373-16c4-4fb2-9f05-07c264ba2153"; // Placeholder: Replace with actual user ID

        try {
            const response = await fetch("http://localhost:5000/api/desks/confirm", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    desk_id: deskId,
                    slot_id: parseInt(modalSelectedSlot),
                    booking_date: selectedBookingDate.toISOString().split('T')[0],
                    booking_id: heldBookingId,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP error! status: ${errorData.error || response.statusText}`);
            }

            const data = await response.json();
            console.log("Booking successful:", data);
            toast.success("Your desk has been booked successfully!");
            setIsModalOpen(false);
            setHeldBookingId(null);
            setModalSelectedSlot(null);
            setHeldDeskId(null);
            setHeldSlotId(null);
        } catch (error: any) {
            console.error("Error booking desk:", error);
            toast.error(`Error booking desk: ${error.message}. Please try again.`);
        }
    };

    const handleHold = async (deskId: string, slotId: string) => {
        if (!deskId || !slotId || !userId) {
            toast.error("Cannot hold desk: Missing required information.");
            return;
        }

        // Clear previous hold if a new slot is selected for the same desk
        // Only clear if the selected slot in the modal changes, or if a new desk is being held.
        if ((heldBookingId && modalSelectedSlot !== slotId) || (heldDeskId && heldDeskId !== deskId)) {
            setHeldBookingId(null);
            setHeldDeskId(null);
            setHeldSlotId(null);
            // In a real app, you might want to call a /cancel-hold endpoint here
        }

        try {
            const holdResponse = await fetch("http://localhost:5000/api/desks/hold", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    user_id: userId,
                    desk_id: parseInt(deskId),
                    slot_id: parseInt(slotId),
                }),
            });

            if (!holdResponse.ok) {
                const errorData = await holdResponse.json();
                throw new Error(`Failed to hold desk: ${errorData.error || holdResponse.statusText}`);
            }

            const data = await holdResponse.json();
            console.log("Desk held successfully:", data);
            setHeldBookingId(data.booking.booking_id);
            setHeldDeskId(deskId);
            setHeldSlotId(slotId);
            toast.success("Desk held for 3 minutes! Please confirm your booking.");
        } catch (error: any) {
            console.error("Error holding desk:", error);
            toast.error(`Error holding desk: ${error.message}. Please try again.`);
            setHeldBookingId(null);
            setHeldDeskId(null);
            setHeldSlotId(null);
        }
    };

    // Pagination logic
    const indexOfLastDesk = currentPage * desksPerPage;
    const indexOfFirstDesk = indexOfLastDesk - desksPerPage;
    const currentDesks = availableDesks.slice(indexOfFirstDesk, indexOfLastDesk);
    const totalPages = Math.ceil(availableDesks.length / desksPerPage);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Connected':
                return 'text-green-600 bg-green-50';
            case 'Disconnected':
                return 'text-red-600 bg-red-50';
            case 'Connection Error':
                return 'text-red-600 bg-red-50';
            default:
                return 'text-yellow-600 bg-yellow-50';
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
            {/* Header Section */}
            <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                Desk Booking
                            </h1>
                            <p className="text-gray-600 mt-2">Find and reserve your perfect workspace</p>
                        </div>
                        <Badge variant="outline" className={`px-3 py-1 ${getStatusColor(connectionStatus)}`}>
                            <div className={`w-2 h-2 rounded-full mr-2 ${connectionStatus === 'Connected' ? 'bg-green-500 animate-pulse' :
                                connectionStatus === 'Disconnected' ? 'bg-red-500' : 'bg-yellow-500'
                                }`}></div>
                            {connectionStatus}
                        </Badge>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Filters Section */}
                <Card className="mb-8 bg-white/60 backdrop-blur-sm border-0 shadow-xl">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
                            <Calendar className="h-6 w-6 text-blue-500" />
                            Book Your Workspace
                        </CardTitle>
                        <CardDescription className="text-gray-600">
                            Select your preferred date, location, and workspace type
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Date Selection */}
                        <div className="space-y-3">
                            <Label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                Select Date
                            </Label>
                            <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-hide">
                                {Array.from({ length: 7 }).map((_, i) => {
                                    const date = new Date();
                                    date.setDate(date.getDate() + i);
                                    const isSelected = selectedBookingDate.toDateString() === date.toDateString();
                                    const isToday = i === 0;
                                    return (
                                        <Button
                                            key={date.toISOString().split('T')[0]}
                                            variant={isSelected ? "default" : "outline"}
                                            onClick={() => setSelectedBookingDate(date)}
                                            className={`flex-none p-4 h-auto text-center min-w-[80px] transition-all duration-200 hover:scale-105 ${isSelected
                                                ? 'bg-gradient-to-br from-blue-500 to-purple-500 shadow-lg'
                                                : 'hover:bg-blue-50 hover:border-blue-300'
                                                }`}
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-xs font-medium opacity-80">
                                                    {isToday ? 'Today' : format(date, "EEE")}
                                                </span>
                                                <span className="text-lg font-bold">{format(date, "dd")}</span>
                                                <span className="text-xs opacity-60">{format(date, "MMM")}
                                                </span>
                                            </div>
                                        </Button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Filter Options */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <Label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    Desk Type
                                </Label>
                                <Select onValueChange={setSelectedDeskType} value={selectedDeskType}>
                                    <SelectTrigger className="bg-white/70 border-gray-200 hover:bg-white focus:bg-white transition-colors">
                                        <SelectValue placeholder="Any desk type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {deskTypes.map((type) => (
                                            <SelectItem className="capitalize" key={type.desk_type_id} value={type.desk_type_id.toString()}>
                                                {type.type.replace(/_/g, " ")} ({type.capacity} capacity)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                    <MapPin className="h-4 w-4" />
                                    Location
                                </Label>
                                <Select onValueChange={setSelectedLocation} value={selectedLocation}>
                                    <SelectTrigger className="bg-white/70 border-gray-200 hover:bg-white focus:bg-white transition-colors">
                                        <SelectValue placeholder="Any location" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {locations.map((location) => (
                                            <SelectItem key={location.location_id} value={location.location_id}>
                                                {location.location_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    Time Slot
                                </Label>
                                <Select onValueChange={setSelectedSlot} value={selectedSlot}>
                                    <SelectTrigger className="bg-white/70 border-gray-200 hover:bg-white focus:bg-white transition-colors">
                                        <SelectValue placeholder="Any time slot" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {slots.map((slot) => (
                                            <SelectItem key={slot.slot_id} value={slot.slot_id.toString()}>
                                                {slot.slot_type} ({slot.start_time.substring(0, 5)} - {slot.end_time.substring(0, 5)})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Results Section */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-2xl font-semibold text-gray-800">
                            Available Desks
                            {availableDesks.length > 0 && (
                                <span className="ml-2 text-lg font-normal text-gray-500">
                                    ({availableDesks.length} found)
                                </span>
                            )}
                        </h3>
                    </div>

                    {availableDesks.length === 0 ? (
                        <Card className="bg-white/60 backdrop-blur-sm border-0 shadow-lg">
                            <CardContent className="flex flex-col items-center justify-center py-16">
                                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                                    <AlertCircle className="h-12 w-12 text-gray-400" />
                                </div>
                                <h4 className="text-xl font-semibold text-gray-800 mb-2">No desks available</h4>
                                <p className="text-gray-600 text-center max-w-md">
                                    Try adjusting your search criteria or selecting a different date to find available workspaces.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {currentDesks.map((desk, index) => (
                                    <Card
                                        key={desk.desk_id}
                                        className={`group bg-white/70 backdrop-blur-sm border-0 shadow-lg transition-all duration-300 animate-fade-in ${heldDeskId === desk.desk_id ? 'border-4 border-blue-500 ring-4 ring-blue-200' : ''}`}
                                        style={{ animationDelay: `${index * 100}ms` }}
                                    >
                                        <CardHeader className="pb-3">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <CardTitle className="text-xl font-semibold text-gray-800 transition-colors">
                                                        {desk.desk_name}
                                                    </CardTitle>
                                                    <CardDescription className="flex items-center gap-4 mt-2 text-sm">
                                                        <span className="flex items-center gap-1">
                                                            <Building className="h-4 w-4" />
                                                            Floor {desk.floor_number}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <MapPin className="h-4 w-4" />
                                                            {desk.building_name}
                                                        </span>
                                                    </CardDescription>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => {
                                                        setSelectedDesk(desk);
                                                        setIsModalOpen(true);
                                                        setModalSelectedSlot(null);
                                                        setHeldBookingId(null);
                                                        setHeldDeskId(null);
                                                        setHeldSlotId(null);
                                                    }}
                                                    className="shrink-0 transition-colors"
                                                >
                                                    <ArrowRight className="h-5 w-5" />
                                                </Button>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pt-0">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-4">
                                                    <Badge variant="secondary" className="flex items-center gap-1">
                                                        <Users className="h-3 w-3" />
                                                        {desk.capacity} seats
                                                    </Badge>
                                                    <Badge
                                                        variant="default"
                                                        className={desk.desk_status.toLowerCase() === 'available'
                                                            ? 'bg-green-500 text-white'
                                                            : 'bg-red-500 text-white'
                                                        }
                                                    >
                                                        {desk.desk_status}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                                                {desk.description}
                                            </p>

                                            {/* Amenities Preview */}
                                            {desk.amenities && desk.amenities.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mb-4">
                                                    {desk.amenities.slice(0, 3).map((amenity, idx) => (
                                                        <div key={idx} className="flex items-center gap-1 text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded-full">
                                                            {getAmenityIcon(amenity)}
                                                            <span>{amenity}</span>
                                                        </div>
                                                    ))}
                                                    {desk.amenities.length > 3 && (
                                                        <div className="text-xs text-gray-500 px-2 py-1">
                                                            +{desk.amenities.length - 3} more
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="text-xs text-gray-500 flex items-center gap-1">
                                                <MapPin className="h-3 w-3" />
                                                {desk.building_address}, {desk.city}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex justify-center mt-8">
                                    <div className="flex space-x-2">
                                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNumber => (
                                            <Button
                                                key={pageNumber}
                                                onClick={() => setCurrentPage(pageNumber)}
                                                variant={currentPage === pageNumber ? "default" : "outline"}
                                                size="sm"
                                                className={currentPage === pageNumber
                                                    ? 'bg-gradient-to-r from-blue-500 to-purple-500'
                                                    : ''
                                                }
                                            >
                                                {pageNumber}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Enhanced Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-4xl max-h-[100vh] flex flex-col p-6 bg-white/95 backdrop-blur-sm">
                    <DialogHeader className="pb-4 border-b border-gray-100">
                        <DialogTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            {selectedDesk?.desk_name}
                        </DialogTitle>
                        <DialogDescription className="text-gray-600 text-lg">
                            Complete workspace details and booking options
                        </DialogDescription>
                    </DialogHeader>

                    {selectedDesk && (
                        <div className="flex-1 overflow-y-auto py-6 space-y-8">
                            <div className="grid grid-cols-1 gap-8">
                                {/* Location Details */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-4">
                                        <MapPin className="h-5 w-5 text-blue-500" />
                                        <h4 className="text-xl font-semibold text-gray-800">Location Details</h4>
                                    </div>
                                    <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-6 rounded-xl space-y-3">
                                        <div className="flex items-center gap-3">
                                            <Building className="h-5 w-5 text-blue-600" />
                                            <div>
                                                <p className="font-medium text-gray-800">Floor {selectedDesk.floor_number}</p>
                                                <p className="text-sm text-gray-600">{selectedDesk.building_name}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <MapPin className="h-5 w-5 text-purple-600" />
                                            <div>
                                                <p className="text-sm text-gray-600">{selectedDesk.building_address}</p>
                                                <p className="text-sm text-gray-600">{selectedDesk.city}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Desk Specifications */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Users className="h-5 w-5 text-green-500" />
                                        <h4 className="text-xl font-semibold text-gray-800">Desk Specifications</h4>
                                    </div>
                                    <div className="bg-gradient-to-br from-green-50 to-blue-50 p-6 rounded-xl space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-600">Capacity</span>
                                            <Badge variant="secondary" className="flex items-center gap-1">
                                                <Users className="h-3 w-3" />
                                                {selectedDesk.capacity} seats
                                            </Badge>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-600">Status</span>
                                            <Badge
                                                variant={selectedDesk.desk_status === 'Available' ? 'outline' : 'destructive'}
                                                className={selectedDesk.desk_status === 'Available'
                                                    ? 'text-green-700 border-green-200 bg-green-50'
                                                    : ''
                                                }
                                            >
                                                {selectedDesk.desk_status}
                                            </Badge>
                                        </div>
                                        <div className="pt-2 border-t border-gray-200">
                                            <p className="text-gray-700 text-sm leading-relaxed">{selectedDesk.description}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Amenities */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-4">
                                        <CheckCircle className="h-5 w-5 text-purple-500" />
                                        <h4 className="text-xl font-semibold text-gray-800">Amenities & Features</h4>
                                    </div>
                                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-xl">
                                        {selectedDesk.amenities && selectedDesk.amenities.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {selectedDesk.amenities.map((amenity, idx) => (
                                                    <div key={idx} className="flex items-center gap-2 text-gray-700 bg-white/60 px-3 py-2 rounded-lg">
                                                        {getAmenityIcon(amenity)}
                                                        <span className="text-sm font-medium">{amenity}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-gray-500 text-center py-4">No specific amenities listed</p>
                                        )}
                                    </div>
                                </div>

                                {/* Operating Hours */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Clock className="h-5 w-5 text-orange-500" />
                                        <h4 className="text-xl font-semibold text-gray-800">Operating Schedule</h4>
                                    </div>
                                    <div className="bg-gradient-to-br from-orange-50 to-yellow-50 p-6 rounded-xl">
                                        <p className="text-gray-700 font-medium">{renderOperatingHours(selectedDesk.operating_hours)}</p>
                                    </div>
                                </div>

                                {/* Booking Slots */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Calendar className="h-5 w-5 text-blue-500" />
                                        <h4 className="text-xl font-semibold text-gray-800">Available Time Slots</h4>
                                    </div>
                                    {selectedDesk.slots.length === 0 ? (
                                        <div className="bg-gray-50 p-8 rounded-xl text-center">
                                            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                            <p className="text-gray-500">No slots available for this desk on the selected date.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-4">
                                            {selectedDesk.slots.map((slot: Slot) => (
                                                <Button
                                                    key={slot.slot_id}
                                                    variant={modalSelectedSlot === slot.slot_id.toString() ? "default" : "outline"}
                                                    onClick={() => {
                                                        setModalSelectedSlot(slot.slot_id.toString());
                                                        if (selectedDesk) {
                                                            handleHold(selectedDesk.desk_id, slot.slot_id.toString());
                                                        }
                                                    }}
                                                    className={`w-full p-4 h-auto flex flex-col items-start space-y-2 transition-all duration-200
                                                        ${modalSelectedSlot === slot.slot_id.toString()
                                                            ? 'bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg text-white'
                                                            : ''
                                                        }
                                                        `}
                                                    disabled={slot.status.toLowerCase() !== 'available'}
                                                >
                                                    <span className="font-semibold text-base">{slot.slot_type}</span>
                                                    <span className="text-sm opacity-80">
                                                        {slot.start_time.substring(0, 5)} - {slot.end_time.substring(0, 5)}
                                                    </span>
                                                    <div className="flex items-center justify-between w-full">
                                                        <Badge
                                                            className={`
                                                                ${heldSlotId === slot.slot_id.toString() && heldDeskId === selectedDesk?.desk_id
                                                                    ? 'bg-blue-500 text-white'
                                                                    : slot.status.toLowerCase() === 'available'
                                                                        ? 'bg-green-500 text-white'
                                                                        : 'bg-red-500 text-white'
                                                                }
                                                            `}
                                                        >
                                                            {heldSlotId === slot.slot_id.toString() && heldDeskId === selectedDesk?.desk_id
                                                                ? 'held'
                                                                : slot.status.toLowerCase()}
                                                        </Badge>
                                                        <span className={`font-bold text-lg ${modalSelectedSlot === slot.slot_id.toString() ? 'text-white' : 'text-gray-800'}`}>
                                                            ${slot.price}
                                                        </span>
                                                    </div>
                                                </Button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Booking Button */}
                                <div className="pt-6 border-t border-gray-200">
                                    <Button
                                        className="w-full py-4 text-lg font-semibold bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg transition-all duration-200"
                                        onClick={() => handleBooking(selectedDesk.desk_id)}
                                        disabled={!modalSelectedSlot || !heldBookingId}
                                    >
                                        {modalSelectedSlot && heldBookingId ? 'Confirm Booking' : 'Select a Time Slot to Hold'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
} 