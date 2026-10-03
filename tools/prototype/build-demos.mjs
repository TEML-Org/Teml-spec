// Builds one page with a board per feature example. Usage: node build-demos.mjs <out.html>
import { boardData } from "./board-data.mjs";
import { page } from "./page.mjs";
import fs from "fs";
const ex = f => new URL("../../Examples/" + f, import.meta.url).pathname;
const DEMOS = [
  {
    key: "actors", tab: "Actors & screens", file: ex("features/actors-and-screens.teml.yaml"), select: "PlaceOrder",
    title: "Actors and screens",
    intro: "Each actor gets a swimlane across the top of the board, and the screens they use sit in that lane. Here a customer orders at a kiosk, and a barista starts and completes the order on a tablet.",
    notice: [
      "Two actor lanes, <b>Customer</b> and <b>Barista</b>, instead of one shared “Screens” lane.",
      "<b>Barista Tablet</b> issues two different commands, Start Order and Complete Order.",
      "Click a screen to see its actor and the commands it issues.",
    ],
  },
  {
    key: "views", tab: "View slices", file: ex("features/view-slices.teml.yaml"), select: "ShowQueue",
    title: "View slices",
    intro: "A view slice shows where a read model is read. It has a green read model with arrows up to whoever reads it: a screen, or an automation that works from it as a to-do list. Its specs say what the view shows after certain events.",
    notice: [
      "<b>Show Queue</b>: the barista's tablet shows the Order Queue.",
      "<b>Track Order</b>: one read model, shown on two screens to two different actors.",
      "<b>Notify Todo</b>: the Ready Notifier automation reads its to-do list, then issues Send Ready Text in the next slice.",
      "View slices are tagged <b>View</b> in their headings. Click one to see its Given / Then specs.",
    ],
  },
  {
    key: "systems", tab: "External system", file: ex("features/external-system.teml.yaml"), select: "ConfirmPayment",
    title: "An external system calls our API",
    intro: "The payment provider can't add events to our model. Its webhook calls our API, which issues our Confirm Payment command. Payment Confirmed is our own event, and it triggers our Receipt Sender automation.",
    notice: [
      "<b>Payment Provider</b> has its own lane at the top, beside the Shopper, because it plays the same role: it starts one of our commands from outside.",
      "The dashed arrow from <b>Payment Confirmed</b> to <b>Receipt Sender</b>: our event triggers our workflow.",
      "<b>Confirm Payment</b>'s specs use When / Then like any user command, including an error case.",
    ],
  },
  {
    key: "hotel", tab: "Full model: hotel", file: ex("hotel.teml.yaml"), select: "RecordPayment",
    title: "Everything together: the hotel",
    intro: "The classic Event Modeling hotel example, using every new feature: four actors, four view slices, two automations, and a payment provider that calls our API.",
    notice: [
      "Actor lanes for <b>Guest</b>, <b>Manager</b>, <b>Front Desk</b> and <b>Housekeeping</b>, with the <b>Payment Provider</b> beside them.",
      "View slices: <b>Browse Rooms</b>, <b>Payment Todo</b> (an automation's to-do list), <b>Show Bookings</b> (two screens) and <b>Cleaning List</b>.",
      "<b>Record Payment</b> is triggered by the provider's webhook. Its <b>Booking Confirmed</b> event triggers the Confirmation Emailer.",
    ],
  },
];
const data = DEMOS.map(({ file, ...d }) => ({ ...d, M: boardData(file) }));
const out = process.argv[2] ?? "out/demos.html";
fs.writeFileSync(out, page("demo-template.html", { DATA: data }));
console.log("wrote", out, fs.statSync(out).size, "bytes");
