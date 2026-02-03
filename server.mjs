import express from "express";
import fs from "fs/promises";
import path from "path";
import cors from "cors";

const app = express();
const PORT = 3000;
const BOOKINGS_FILE = "bookings.json";

app.use(cors());
app.use(express.json());
app.use(express.static("."));

// Initialize bookings file if it doesn't exist
async function initBookingsFile() {
  try {
    await fs.access(BOOKINGS_FILE);
  } catch {
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify([], null, 2));
  }
}

// Get all bookings
app.get("/api/bookings", async (req, res) => {
  try {
    const data = await fs.readFile(BOOKINGS_FILE, "utf8");
    res.json(JSON.parse(data));
  } catch (err) {
    console.error("Error reading bookings:", err);
    res.json([]);
  }
});

// Create new booking
app.post("/api/bookings", async (req, res) => {
  try {
    const { driver, date, timeSlot, location, phone, notes } = req.body;

    // Validate
    if (!driver || !date || !timeSlot || !location || !phone) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Read existing bookings
    const data = await fs.readFile(BOOKINGS_FILE, "utf8");
    const bookings = JSON.parse(data);

    // Create new booking
    const newBooking = {
      id: Date.now(),
      driver,
      date,
      timeSlot,
      location,
      phone,
      notes: notes || "",
      createdAt: new Date().toISOString(),
      status: "pending"
    };

    bookings.push(newBooking);

    // Save updated bookings
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));

    console.log("New booking:", newBooking);
    res.json({ success: true, booking: newBooking });
  } catch (err) {
    console.error("Error creating booking:", err);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

// Delete booking
app.delete("/api/bookings/:id", async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const data = await fs.readFile(BOOKINGS_FILE, "utf8");
    let bookings = JSON.parse(data);

    bookings = bookings.filter(b => b.id !== bookingId);
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting booking:", err);
    res.status(500).json({ error: "Failed to delete booking" });
  }
});

initBookingsFile().then(() => {
  app.listen(PORT, () => {
    console.log(`📅 Booking server running at http://localhost:${PORT}`);
  });
});
