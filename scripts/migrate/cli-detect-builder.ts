#!/usr/bin/env npx tsx
import "dotenv/config";
import { detectSitePageBuilder } from "./detect-builder";
import { getWpUrl } from "../../app/api/wp/config";

detectSitePageBuilder()
  .then((builder) => {
    console.log(`Site builder at ${getWpUrl()}: ${builder}`);
    if (builder === "elementor") {
      console.log("Elementor migration: npm run migrate");
    }
  })
  .catch(console.error);
