"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import io, { Socket } from "socket.io-client";
import { ArrowRight, Calendar, MapPin, Clock, Users, Wifi, Coffee, Monitor, Building, CheckCircle, AlertCircle, Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import toast, { Toaster } from "react-hot-toast";
import { useDeskHold } from "@/hooks/use-desk-hold";
import { Skeleton } from "@/components/ui/skeleton";

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
        // Ensure all elements are strings before joining
        return amenities.map(item => String(item)).join(", ");
    } else if (typeof amenities === 'object' && amenities !== null) {
        const amenityStrings = Object.entries(amenities)
            .filter(([, value]) => value === true)
            .map(([key]) => key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()));
        return amenityStrings.length > 0 ? amenityStrings.join(", ") : "N/A";
    } else if (amenities !== null && amenities !== undefined) { // Be more explicit about non-null/undefined
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
    rating?: number; // Optional rating property
}

export default function DeskBookingPage() {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const { heldBookingId, setHeldBookingId, releaseHold } = useDeskHold();

    const [deskTypes, setDeskTypes] = useState<DeskType[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [slots, setSlots] = useState<Slot[]>([]);
    const [availableDesks, setAvailableDesks] = useState<Desk[]>([]);

    const [selectedDeskType, setSelectedDeskType] = useState<string>("");
    const [selectedLocation, setSelectedLocation] = useState<string>("");
    const [selectedSlot, setSelectedSlot] = useState<string>("");
    const [selectedBookingDate, setSelectedBookingDate] = useState<Date>(new Date());
    const [modalSelectedSlot, setModalSelectedSlot] = useState<string | null>(null);
    const [heldDeskId, setHeldDeskId] = useState<string | null>(null);
    const [heldSlotId, setHeldSlotId] = useState<string | null>(null);
    const [loadingDesks, setLoadingDesks] = useState<boolean>(false);

    const [selectedDesk, setSelectedDesk] = useState<Desk | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

    const socket = useRef<Socket | null>(null);

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
        setLoadingDesks(true);
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
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            console.error("Error fetching master data:", error);
            toast.error(`Failed to load master data: ${errorMessage}. Please refresh the page.`);
        }
    }, []);

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
            emitFilterChanges();
        });

        currentSocket.on('disconnect', () => {
            console.log('Disconnected from WebSocket');
        });

        currentSocket.on('connect_error', (error: Error) => {
            console.error('Connection error:', error);
            toast.error(`WebSocket connection error: ${error.message}.`);
        });

        currentSocket.on('reconnect_attempt', (attemptNumber: number) => {
            console.log('Reconnection attempt:', attemptNumber);
            toast(`Reconnecting to server (attempt ${attemptNumber})...`, { icon: '⏳' });
        });

        currentSocket.on('reconnect', (attemptNumber: number) => {
            console.log('Reconnected after', attemptNumber, 'attempts');
            toast.success('Reconnected to server!');
            emitFilterChanges();
        });

        currentSocket.on('desk_update', (data: { desks: Desk[] }) => {
            console.log('Received desk update:', data);
            setAvailableDesks(data.desks || []);
            setCurrentPage(1);
            setLoadingDesks(false);
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
    }, [emitFilterChanges, fetchMasterData]);

    useEffect(() => {
        if (!isLoading && isAuthenticated) {
            emitFilterChanges();
        }
    }, [selectedDeskType, selectedLocation, selectedSlot, selectedBookingDate, isAuthenticated, isLoading, emitFilterChanges]);

    useEffect(() => {
        if (!isModalOpen) {
            // Clear modal-specific states when modal is closed
            if (heldBookingId) {
                releaseHold();
            }
            setModalSelectedSlot(null);
            setHeldDeskId(null);
            setHeldSlotId(null);
        }
    }, [isModalOpen, heldBookingId, releaseHold]);

    if (isLoading || !isAuthenticated) {
        return null;
    }

    const handleBooking = async (deskId: string) => {
        if (!deskId || !modalSelectedSlot || !heldBookingId) {
            toast.error("Please select a desk and a time slot first (and ensure it's held).");
            return;
        }

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
            generateBookingPDF(data.booking);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            console.error("Error booking desk:", error);
            toast.error(`Error booking desk: ${errorMessage}. Please try again.`);
        }
    };

    const generateBookingPDF = async (bookingDetails: {
        id: string;
        booking_id: string;
        desk_id: string;
        desk_name: string;
        building_name: string;
        building_address: string;
        start_time: string;
        end_time: string;
        price: number;
        customer_name: string;
        customer_email: string;
        booking_details?: {
            id: string;
            desk_id: string;
            user_details?: {
                name?: string;
                email?: string;
                phone?: string;
            };
            slot_details?: {
                date?: string;
            };
            desk_details?: {
                name?: string;
                floor_number?: string;
                description?: string;
            };
            pricing?: {
                price?: number;
                tax?: number;
                total?: number;
            };
            building_information?: {
                name?: string;
                address?: string;
                operating_hours?: {
                    open?: string;
                    close?: string;
                };
                amenities?: string[] | Record<string, boolean>;
            };
        };
    }) => {
        console.log("Booking Details for PDF generation:", bookingDetails)
        if (!bookingDetails || typeof bookingDetails !== 'object' || Array.isArray(bookingDetails)) {
            console.error("Invalid bookingDetails provided to generateBookingPDF:", bookingDetails);
            toast.error("Failed to generate PDF: Invalid booking details.");
            return;
        }

        const { jsPDF } = await import("jspdf")
        const QRCode = await import("qrcode")

        const doc = new jsPDF()
        const pageWidth = doc.internal.pageSize.width
        const pageHeight = doc.internal.pageSize.height

        // Professional color scheme
        const colors = {
            primary: "#2563eb", // Blue 600
            secondary: "#1e40af", // Blue 700
            accent: "#3b82f6", // Blue 500
            text: "#111827", // Gray 900
            textSecondary: "#4b5563", // Gray 600
            textLight: "#9ca3af", // Gray 400
            background: "#f9fafb", // Gray 50
            white: "#ffffff",
            success: "#059669", // Emerald 600
            border: "#d1d5db", // Gray 300
        }

        const hexToRgb = (hex: string): [number, number, number] => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
            return result
                ? [Number.parseInt(result[1], 16), Number.parseInt(result[2], 16), Number.parseInt(result[3], 16)]
                : [0, 0, 0]
        }

        const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`
        const formatDate = (dateString: string | null | undefined) => {
            if (!dateString) return '';
            const date = new Date(dateString);
            return isNaN(date.getTime()) ? '' : date.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
            });
        }

        // Destructure and safely access nested details
        const booking_details = bookingDetails?.booking_details;
        const userDetails = booking_details?.user_details;
        const slotDetails = booking_details?.slot_details;
        const deskDetails = booking_details?.desk_details;
        const pricing = booking_details?.pricing;
        const buildingInformation = booking_details?.building_information;
        const operatingHours = buildingInformation?.operating_hours;
        const amenities = buildingInformation?.amenities;

        // Clean Header Design
        const drawHeader = () => {
            // Simple top border
            doc.setFillColor(...hexToRgb(colors.primary))
            doc.rect(0, 0, pageWidth, 4, "F")

            // Company section
            doc.setTextColor(...hexToRgb(colors.text))
            doc.setFont("helvetica", "bold")
            doc.setFontSize(28)
            doc.text("WORKSPACE", 20, 25)

            doc.setFont("helvetica", "normal")
            doc.setFontSize(11)
            doc.setTextColor(...hexToRgb(colors.textSecondary))
            doc.text("Professional Workspace Solutions", 20, 35)
            doc.text("contact@workspace.com", 20, 42)
            doc.text("+1 (555) 000-0000", 20, 49)

            // Invoice info - right aligned
            doc.setFont("helvetica", "bold")
            doc.setFontSize(24)
            doc.setTextColor(...hexToRgb(colors.primary))
            doc.text("INVOICE", pageWidth - 20, 25, { align: "right" })

            doc.setFont("helvetica", "normal")
            doc.setFontSize(11)
            doc.setTextColor(...hexToRgb(colors.text))
            doc.text(`#${bookingDetails.id ?? ''}`, pageWidth - 20, 35, { align: "right" })
            doc.text(`Date: ${formatDate(new Date().toISOString())}`, pageWidth - 20, 42, { align: "right" })

            // Status badge
            doc.setFillColor(...hexToRgb(colors.success))
            doc.roundedRect(pageWidth - 65, 46, 45, 8, 2, 2, "F")
            doc.setTextColor(255, 255, 255)
            doc.setFont("helvetica", "bold")
            doc.setFontSize(8)
            doc.text("CONFIRMED", pageWidth - 42.5, 51.5, { align: "center" })
        }

        // Clean customer info section
        const drawCustomerSection = () => {
            let yPos = 75

            // Bill To
            doc.setFont("helvetica", "bold")
            doc.setFontSize(12)
            doc.setTextColor(...hexToRgb(colors.text))
            doc.text("BILL TO", 20, yPos)

            yPos += 8
            doc.setFont("helvetica", "normal")
            doc.setFontSize(11)
            if (userDetails?.name) {
                doc.text(String(userDetails.name), 20, yPos)
                yPos += 6
            }
            if (userDetails?.email) {
                doc.text(String(userDetails.email), 20, yPos)
                yPos += 6
            }
            if (userDetails?.phone) {
                doc.text(String(userDetails.phone), 20, yPos)
                yPos += 6
            }

            // Booking Details - right side
            let rightYPos = 75
            doc.setFont("helvetica", "bold")
            doc.setFontSize(12)
            doc.setTextColor(...hexToRgb(colors.text))
            doc.text("BOOKING DETAILS", pageWidth - 20, rightYPos, { align: "right" })

            rightYPos += 8
            doc.setFont("helvetica", "normal")
            doc.setFontSize(11)
            if (slotDetails?.date) {
                doc.text(`Date: ${formatDate(slotDetails.date)}`, pageWidth - 20, rightYPos, {
                    align: "right",
                })
                rightYPos += 6
            }
            // Assuming time is always 9:00 AM - 6:00 PM for now, no conditional needed unless this changes
            doc.text(`Time: 9:00 AM - 6:00 PM`, pageWidth - 20, rightYPos, { align: "right" })
            rightYPos += 6
            if (deskDetails?.name) {
                doc.text(`Desk: ${String(deskDetails.name)}`, pageWidth - 20, rightYPos, { align: "right" })
                rightYPos += 6
            }
            if (deskDetails?.floor_number) {
                doc.text(`Floor: ${String(deskDetails.floor_number)}`, pageWidth - 20, rightYPos, {
                    align: "right",
                })
                rightYPos += 6
            }
        }

        // Professional table design
        const drawItemsTable = () => {
            let yPos = 130

            // Table header with proper spacing
            doc.setFillColor(...hexToRgb(colors.background))
            doc.rect(20, yPos, pageWidth - 40, 12, "F")

            doc.setFont("helvetica", "bold")
            doc.setFontSize(10)
            doc.setTextColor(...hexToRgb(colors.text))

            // Column headers with proper spacing
            doc.text("DESCRIPTION", 25, yPos + 8)
            doc.text("LOCATION", 60, yPos + 8)
            doc.text("DURATION", 95, yPos + 8)
            doc.text("RATE", 130, yPos + 8)
            doc.text("AMOUNT", pageWidth - 25, yPos + 8, { align: "right" })

            yPos += 12

            // Table border
            doc.setDrawColor(...hexToRgb(colors.border))
            doc.setLineWidth(0.5)
            doc.line(20, yPos, pageWidth - 20, yPos)

            yPos += 8

            // Item row with better spacing - conditionally render if desk details and pricing are available
            if (deskDetails?.name && pricing?.price) {
                doc.setFont("helvetica", "normal")
                doc.setFontSize(11)
                doc.setTextColor(...hexToRgb(colors.text))

                doc.text(String(deskDetails.name), 25, yPos)
                doc.text(`Floor ${String(deskDetails.floor_number ?? '')}`, 60, yPos)
                doc.text("9 hours", 95, yPos)
                doc.text(formatCurrency(pricing.price), 130, yPos)
                doc.text(formatCurrency(pricing.price), pageWidth - 25, yPos, { align: "right" })

                yPos += 6
                // Description on second line
                if (deskDetails.description) {
                    doc.setFontSize(9)
                    doc.setTextColor(...hexToRgb(colors.textSecondary))
                    doc.text(String(deskDetails.description), 25, yPos, { maxWidth: 70 })
                }
                yPos += 15 // Ensure spacing even if description is missing
            }
            doc.setDrawColor(...hexToRgb(colors.border))
            doc.line(20, yPos, pageWidth - 20, yPos)

            return yPos
        }

        // Clean totals section
        const drawTotals = (startY: number) => {
            let yPos = startY + 15
            const totalsX = pageWidth - 60

            doc.setFont("helvetica", "normal")
            doc.setFontSize(11)
            doc.setTextColor(...hexToRgb(colors.text))

            // Subtotal
            if (pricing?.price !== undefined && pricing.price !== null) {
                doc.text("Total", totalsX, yPos)
                doc.text(formatCurrency(pricing.price), pageWidth - 25, yPos, { align: "right" })
                yPos += 8
            }

            // Tax
            if (pricing?.tax !== undefined && pricing.tax !== null) {
                doc.text("Tax (10%)", totalsX, yPos)
                doc.text(formatCurrency(pricing.tax), pageWidth - 25, yPos, { align: "right" })
                yPos += 8
            }

            // Separator line
            doc.setDrawColor(...hexToRgb(colors.border))
            doc.line(totalsX, yPos, pageWidth - 25, yPos)
            yPos += 8

            // Total
            if (pricing?.total !== undefined && pricing.total !== null) {
                doc.setFont("helvetica", "bold")
                doc.setFontSize(14)
                doc.setTextColor(...hexToRgb(colors.primary))
                doc.text("TOTAL", totalsX, yPos)
                doc.text(formatCurrency(pricing.total), pageWidth - 25, yPos, { align: "right" })
            }

            return yPos
        }

        // Venue information section
        const drawVenueInfo = (startY: number) => {
            let yPos = startY + 25

            doc.setFont("helvetica", "bold")
            doc.setFontSize(12)
            doc.setTextColor(...hexToRgb(colors.text))
            doc.text("VENUE INFORMATION", 20, yPos)

            yPos += 10
            doc.setFont("helvetica", "normal")
            doc.setFontSize(11)
            doc.setTextColor(...hexToRgb(colors.textSecondary))

            if (buildingInformation?.name) {
                doc.text(String(buildingInformation.name), 20, yPos)
                yPos += 6
            }
            if (buildingInformation?.address) {
                doc.text(String(buildingInformation.address), 20, yPos)
                yPos += 6
            }
            if (operatingHours?.open && operatingHours?.close) {
                doc.text(
                    `Hours: ${String(operatingHours.open)} - ${String(operatingHours.close)}`,
                    20,
                    yPos,
                )
                yPos += 6
            }
            const renderedAmenities = renderAmenities(amenities);
            if (renderedAmenities && renderedAmenities !== "N/A") {
                doc.text(`Amenities: ${renderedAmenities}`, 20, yPos, {
                    maxWidth: 120,
                })
                yPos += 6
            }

            return yPos
        }

        // QR Code with better positioning
        const drawQRCode = async (venueEndY: number) => {
            const qrData = {
                bookingId: String(bookingDetails.id ?? ''),
                deskId: String(bookingDetails.desk_id ?? ''),
                date: String(slotDetails?.date ?? ''),
            }

            // Always attempt to draw QR code with available data
            try {
                // Create QR code with data (even if empty, it will produce a valid QR for empty string)
                const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
                    errorCorrectionLevel: "L", // Lower error correction for potentially less data
                    width: 150,
                    margin: 1,
                });

                const qrSize = 35;
                const qrX = pageWidth - 60;
                const qrY = venueEndY - 40; // Adjusted QR code Y position to move it further up

                doc.addImage(qrCodeDataURL, "PNG", qrX, qrY, qrSize, qrSize);

                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                doc.setTextColor(...hexToRgb(colors.textLight));
                doc.text("Scan for details", qrX + qrSize / 2, qrY + qrSize + 6, { align: "center" });
            } catch (error) {
                console.error("QR Code generation or drawing error:", error);
                // Optionally, draw a placeholder or a message indicating QR code is unavailable
            }
        }

        // Clean footer
        const drawFooter = () => {
            const footerY = pageHeight - 25

            doc.setDrawColor(...hexToRgb(colors.border))
            doc.line(20, footerY - 5, pageWidth - 20, footerY - 5)

            doc.setFont("helvetica", "normal")
            doc.setFontSize(9)
            doc.setTextColor(...hexToRgb(colors.textLight))
            doc.text("Thank you for choosing our workspace solutions!", pageWidth / 2, footerY, { align: "center" })
            doc.text("Questions? Contact support@workspace.com", pageWidth / 2, footerY + 7, { align: "center" })
        }

        // Generate the PDF
        drawHeader()
        drawCustomerSection()
        const tableEndY = drawItemsTable()
        const totalsEndY = drawTotals(tableEndY)
        const venueEndY = drawVenueInfo(totalsEndY)
        await drawQRCode(venueEndY)
        drawFooter()

        doc.save(`DeskBooking_Invoice_${bookingDetails.id ?? 'unknown'}.pdf`)
    };

    const handleHold = async (deskId: string, slotId: string) => {
        if (!deskId || !slotId || !userId) {
            toast.error("Cannot hold desk: Missing required information.");
            return;
        }

        if ((heldBookingId && modalSelectedSlot !== slotId) || (heldDeskId && heldDeskId !== deskId)) {
            setHeldBookingId(null);
            setHeldDeskId(null);
            setHeldSlotId(null);
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
                    booking_date: selectedBookingDate.toISOString().split('T')[0],
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
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            console.error("Error holding desk:", error);
            toast.error(`Error holding desk: ${errorMessage}. Please try again.`);
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
            {/* Header Section */}
            {/* <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 sticky top-0 z-10">
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
            </div> */}

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Filters Section */}
                <div className="mb-8">
                    <div className="pb-4">
                        <h2 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
                            <Calendar className="h-6 w-6 text-blue-500" />
                            Book Your Workspace
                        </h2>
                        <p className="text-gray-600">
                            Select your preferred date, location, and workspace type
                        </p>
                    </div>
                    <div className="space-y-6">
                        {/* Date Selection */}
                        <div className="space-y-3">
                            <Label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                Select Date
                            </Label>
                            <div className="flex space-x-3 p-2 overflow-x-auto pb-2 scrollbar-hide">
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
                    </div>
                </div>

                {/* Results Section */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        {availableDesks.length !== 0
                            &&
                            <h3 className="text-2xl font-semibold text-gray-800">
                                Available Desks
                                {availableDesks.length > 0 && (
                                    <span className="ml-2 text-sm font-normal text-gray-500">
                                        ({availableDesks.length} found)
                                    </span>
                                )}
                            </h3>
                        }
                    </div>

                    {availableDesks.length === 0 && !loadingDesks ? (
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
                    ) : loadingDesks ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {[...Array(desksPerPage)].map((_, index) => (
                                <Card key={index} className="group bg-white/70 backdrop-blur-sm border-0 shadow-lg transition-all duration-300 animate-fade-in">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 space-y-2">
                                                <Skeleton className="h-6 w-3/4" />
                                                <div className="flex items-center gap-4 mt-2 text-sm">
                                                    <Skeleton className="h-4 w-20" />
                                                    <Skeleton className="h-4 w-24" />
                                                </div>
                                            </div>
                                            <Skeleton className="h-8 w-8 rounded-full" />
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-0 space-y-4">
                                        <div className="flex items-center gap-4">
                                            <Skeleton className="h-6 w-20 rounded-full" />
                                            <Skeleton className="h-6 w-24 rounded-full" />
                                            <Skeleton className="h-6 w-16 rounded-full" />
                                        </div>
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-4 w-5/6" />
                                        <div className="flex flex-wrap gap-2">
                                            <Skeleton className="h-6 w-20 rounded-full" />
                                            <Skeleton className="h-6 w-20 rounded-full" />
                                            <Skeleton className="h-6 w-20 rounded-full" />
                                        </div>
                                        <Skeleton className="h-4 w-1/2" />
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
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
                                                        variant="outline"
                                                        className={
                                                            desk.desk_status.toLowerCase() === 'available'
                                                                ? 'text-blue-700 border-blue-200 bg-blue-50'
                                                                : desk.desk_status === 'Available'
                                                                    ? 'text-green-700 border-green-200 bg-green-50'
                                                                    : ''
                                                        }
                                                    >
                                                        {desk.desk_status}
                                                    </Badge>
                                                    {desk.rating !== undefined && desk.rating !== null && (
                                                        <div className="flex items-center gap-1 text-yellow-500">
                                                            <Star className="h-4 w-4 fill-yellow-500 stroke-yellow-500" />
                                                            <span className="font-semibold text-gray-800">{desk.rating.toFixed(1)}</span>
                                                        </div>
                                                    )}
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
                                        <Button
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            variant="outline"
                                            size="sm"
                                            disabled={currentPage === 1}
                                        >
                                            Previous
                                        </Button>
                                        {(() => {
                                            const pageNumbers = [];
                                            const maxButtons = 5; // Maximum number of buttons to show
                                            const startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
                                            const endPage = Math.min(totalPages, startPage + maxButtons - 1);

                                            if (startPage > 1) {
                                                pageNumbers.push(1);
                                                if (startPage > 2) {
                                                    pageNumbers.push('...');
                                                }
                                            }

                                            for (let i = startPage; i <= endPage; i++) {
                                                pageNumbers.push(i);
                                            }

                                            if (endPage < totalPages) {
                                                if (endPage < totalPages - 1) {
                                                    pageNumbers.push('...');
                                                }
                                                pageNumbers.push(totalPages);
                                            }

                                            return pageNumbers.map((pageNumber, index) => (
                                                <Button
                                                    key={pageNumber === '...' ? `ellipsis-${index}` : pageNumber}
                                                    onClick={() => pageNumber !== '...' && setCurrentPage(Number(pageNumber))}
                                                    variant={currentPage === pageNumber ? "default" : "outline"}
                                                    size="sm"
                                                    className={currentPage === pageNumber
                                                        ? 'bg-gradient-to-r from-blue-500 to-purple-500'
                                                        : pageNumber === '...' ? 'cursor-default' : ''
                                                    }
                                                    disabled={pageNumber === '...'}
                                                >
                                                    {pageNumber}
                                                </Button>
                                            ));
                                        })()}
                                        <Button
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            variant="outline"
                                            size="sm"
                                            disabled={currentPage === totalPages}
                                        >
                                            Next
                                        </Button>
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
                                                <p className="font-medium text-gray-800">{selectedDesk.floor_number}th Floor</p>
                                                <p className="text-sm text-gray-600">{selectedDesk.building_name}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <MapPin className="h-5 w-5 text-purple-600" />
                                            <div>
                                                <p className="text-sm text-gray-600">{selectedDesk.building_address}</p>                                            </div>
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
                                                variant="outline"
                                                className={
                                                    selectedDesk.desk_status.toLowerCase() === 'available'
                                                        ? 'text-blue-700 border-blue-200 bg-blue-50'
                                                        : selectedDesk.desk_status === 'Available'
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
                                        {(() => {
                                            // Handle different amenity data structures
                                            let amenityItems: string[] = [];
                                            
                                            if (Array.isArray(selectedDesk.amenities)) {
                                                amenityItems = selectedDesk.amenities.map(item => String(item));
                                            } else if (typeof selectedDesk.amenities === 'object' && selectedDesk.amenities !== null) {
                                                amenityItems = Object.entries(selectedDesk.amenities)
                                                    .filter(([, value]) => value === true)
                                                    .map(([key]) => key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()));
                                            } else if (typeof selectedDesk.amenities === 'string') {
                                                amenityItems = [selectedDesk.amenities];
                                            }

                                            return amenityItems.length > 0 ? (
                                                <div className="grid grid-cols-1 gap-3">
                                                    {amenityItems.map((amenity, idx) => (
                                                        <div 
                                                            key={idx} 
                                                            className="flex items-center gap-3 text-gray-700 bg-white/70 px-4 py-2 rounded-xl shadow-sm border border-gray-200 hover:bg-white transition-all duration-200"
                                                        >
                                                             {getAmenityIcon(amenity)}
                                                             <span className="text-base font-medium">{amenity}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-gray-500 text-center py-4">No specific amenities listed</p>
                                            );
                                        })()}
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

            <Toaster />
        </div>
    );
} 