import { Outlet } from "react-router";

/** Parent layout for /puck — prevents `:site` catching the "puck" segment. */
export default function PuckHubLayout() {
  return <Outlet />;
}
