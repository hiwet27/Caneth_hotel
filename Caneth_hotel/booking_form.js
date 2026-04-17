
        // IMPORTANT: Prevent any page refresh
        if (window.history && window.history.pushState) {
            window.history.pushState(null, null, window.location.href);
            window.onpopstate = function() {
                window.history.pushState(null, null, window.location.href);
            };
        }
        
        // Socket.IO connection
        const socket = io('http://localhost:5000', {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000
        });
        
        const API_URL = "http://localhost:5000/api";
        let currentBookingId = null;
        let isWaitingForApproval = false;
        
        // Date setup
        const today = new Date().toISOString().split("T")[0];
        document.getElementById("checkIn").min = today;
        document.getElementById("checkOut").min = today;
        
        // Guest counter functions
        window.incrementGuests = function() {
            let count = parseInt(document.getElementById("guestCount").innerText);
            if (count < 10) {
                count++;
                document.getElementById("guestCount").innerText = count;
                document.getElementById("guests").value = count;
            }
        };
        
        window.decrementGuests = function() {
            let count = parseInt(document.getElementById("guestCount").innerText);
            if (count > 1) {
                count--;
                document.getElementById("guestCount").innerText = count;
                document.getElementById("guests").value = count;
            }
        };
        
        // UI functions
        function showLoading() {
            document.getElementById("loading").style.display = "flex";
        }
        
        function hideLoading() {
            document.getElementById("loading").style.display = "none";
        }
        
        window.showModal = function(type, title, message) {
            const modal = document.getElementById("modal");
            const icon = document.getElementById("modalIcon");
            const modalTitle = document.getElementById("modalTitle");
            const modalMessage = document.getElementById("modalMessage");
            
            icon.className = type === "success" ? "fas fa-check-circle" : "fas fa-times-circle";
            icon.style.color = type === "success" ? "#4caf50" : "#f44336";
            modalTitle.textContent = title;
            modalMessage.textContent = message;
            modal.style.display = "flex";
        };
        
        window.closeModal = function() {
            document.getElementById("modal").style.display = "none";
        };
        
        window.closePaymentModal = function() {
            document.getElementById("paymentModal").style.display = "none";
        };
        
        function showPaymentModal(bookingId, amount) {
            document.getElementById("paymentBookingId").textContent = bookingId.slice(-6);
            document.getElementById("paymentAmount").textContent = amount + " birr";
            document.getElementById("paymentModal").style.display = "flex";
        }
        
        window.processPayment = async function(paymentMethod) {
            if (!currentBookingId) return;
            
            showLoading();
            try {
                const response = await fetch(`${API_URL}/bookings/${currentBookingId}/payment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        paymentMethod: paymentMethod,
                        paymentDetails: {
                            processedBy: document.getElementById("fullName").value,
                            processedAt: new Date().toISOString()
                        }
                    })
                });
                
                const data = await response.json();
                
                if (response.ok && data.success) {
                    window.closePaymentModal();
                    window.showModal("success", "Payment Successful! 🎉", "Thank you! Your booking is now confirmed.");
                    
                    // Reset form
                    document.getElementById("bookingForm").reset();
                    document.getElementById("guestCount").innerText = "1";
                    document.getElementById("guests").value = "1";
                    localStorage.removeItem("bookingId");
                    currentBookingId = null;
                    isWaitingForApproval = false;
                    
                    // Reset button
                    const submitBtn = document.getElementById("submitBtn");
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-check-circle"></i> Confirm Booking';
                    document.getElementById("waitingMessage").style.display = "none";
                } else {
                    window.showModal("error", "Payment Failed", data.message || "Please try again.");
                }
            } catch (error) {
                window.showModal("error", "Payment Error", "Unable to process payment.");
            } finally {
                hideLoading();
            }
        };
        
        // Socket event listeners
        socket.on('connect', () => {
            console.log('✅ Connected to server');
            socket.emit('register', { type: 'booking_form', timestamp: Date.now() });
        });
        
        socket.on("bookingUpdated", (booking) => {
            console.log('📡 Booking update:', booking);
            
            if (currentBookingId && booking.id === currentBookingId) {
                if (booking.status === "confirmed") {
                    window.closeModal();
                    showPaymentModal(booking.id, booking.totalAmount || 0);
                } else if (booking.status === "rejected") {
                    window.closeModal();
                    window.showModal("error", "Booking Rejected ❌", booking.rejectionReason || "Your booking was not approved.");
                    localStorage.removeItem("bookingId");
                    currentBookingId = null;
                    isWaitingForApproval = false;
                    
                    // Reset button
                    const submitBtn = document.getElementById("submitBtn");
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-check-circle"></i> Confirm Booking';
                    document.getElementById("waitingMessage").style.display = "none";
                }
            }
        });
        
        // Form submission - NO REFRESH
        document.getElementById("bookingForm").addEventListener("submit", async (e) => {
            e.preventDefault(); // CRITICAL: This prevents page refresh
            e.stopPropagation(); // Extra prevention
            
            if (isWaitingForApproval) {
                window.showModal("info", "Pending Approval", "Your previous booking is waiting for admin approval.");
                return;
            }
            
            const checkIn = document.getElementById("checkIn").value;
            const checkOut = document.getElementById("checkOut").value;
            
            if (checkIn && checkOut && new Date(checkOut) <= new Date(checkIn)) {
                window.showModal("error", "Invalid Dates", "Check-out must be after check-in.");
                return;
            }
            
            const bookingData = {
                fullName: document.getElementById("fullName").value.trim(),
                phone: document.getElementById("phone").value.trim(),
                roomType: document.querySelector('input[name="roomType"]:checked')?.value,
                selectRoom: document.getElementById("selectRoom").value,
                guests: parseInt(document.getElementById("guests").value),
                checkIn: checkIn,
                checkOut: checkOut,
                specialRequests: document.getElementById("specialRequests").value.trim()
            };
            
            if (!bookingData.fullName || !bookingData.phone || !bookingData.roomType || 
                !bookingData.selectRoom || !bookingData.checkIn || !bookingData.checkOut) {
                window.showModal("error", "Missing Info", "Please fill all required fields.");
                return;
            }
            
            showLoading();
            
            try {
                const response = await fetch(`${API_URL}/bookings`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(bookingData)
                });
                
                const data = await response.json();
                
                if (response.ok && data.success) {
                    currentBookingId = data.booking.id;
                    localStorage.setItem("bookingId", currentBookingId);
                    isWaitingForApproval = true;
                    
                    // Disable submit button and show waiting message
                    const submitBtn = document.getElementById("submitBtn");
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Waiting for Approval...';
                    document.getElementById("waitingMessage").style.display = "block";
                    
                    window.showModal("success", "Booking Submitted! 🎉", 
                        `Thank you ${bookingData.fullName}! Your booking request has been sent. You'll be notified when admin responds.`);
                    
                } else {
                    window.showModal("error", "Booking Failed", data.message || "Please try again.");
                }
            } catch (error) {
                console.error('Error:', error);
                window.showModal("error", "Connection Error", "Unable to connect to server. Make sure the server is running on port 5000.");
            } finally {
                hideLoading();
            }
        });
        
        // Extra prevention: disable any auto-refresh
        if (window.location.hash === '#norefresh') {
            window.location.hash = '';
        }
        
        // Prevent F5 refresh
        window.addEventListener('beforeunload', function(e) {
            if (isWaitingForApproval) {
                e.preventDefault();
                e.returnValue = 'You have a pending booking approval. Are you sure you want to leave?';
                return 'You have a pending booking approval. Are you sure you want to leave?';
            }
        });
        
        console.log('✅ Booking form ready - No auto-refresh!');
