import { MapContainer, TileLayer, Marker, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";

const bounds: L.LatLngBoundsExpression = [
  [-23.56, -46.66], // Lower left
  [-23.54, -46.63], // Upper right
];

const customIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3887/3887921.png", // Path to your image in /public
  iconSize: [64, 64], // [width, height] in pixels
  iconAnchor: [16, 32], // Point of the icon which will correspond to marker's location (center-bottom)
  popupAnchor: [0, -32], // Point from which the popup should open relative to the iconAnchor
});

export function MapPartial() {
  return (
    <MapContainer
      center={[-23.55, -46.645]}
      zoom={13}
      minZoom={12}
      maxBounds={bounds}
      maxBoundsViscosity={1.0}
      style={{ height: "calc(100vh - 64px)", width: "100%" }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {/* Markers go here */}
      <Marker
        icon={customIcon}
        position={[-23.55, -46.645]}
        eventHandlers={{
          click: () => {
            console.log("Marker clicked! Open your photo modal here.");
          },
          mouseover: (e) => {
            e.target.openTooltip();
          },
          mouseout: (e) => {
            e.target.closeTooltip();
          },
        }}
      >
        {/* Hover label */}
        <Tooltip direction="top" offset={[0, -20]} opacity={1}>
          <span>Cool Place Name</span>
        </Tooltip>

        {/* Click content (Google Maps style) */}
        <Popup maxWidth={300}>
          <div style={{ textAlign: "center" }}>
            <h3>Awesome Location</h3>
            <img
              src="https://cdn-icons-png.flaticon.com/512/3887/3887921.png"
              alt="Location"
              style={{ width: "100%", borderRadius: "8px" }}
            />
            <p>This is where the magic happens.</p>
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}
