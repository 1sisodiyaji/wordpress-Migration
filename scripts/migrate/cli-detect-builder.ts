#!/usr/bin/env npx tsx
import "dotenv/config";
import { detectSitePageBuilder } from "./detect-builder";
import { WP_URL } from "../../app/api/wp/config";

detectSitePageBuilder()
  .then((builder) => {
    console.log(`Site builder at ${WP_URL}: ${builder}`);
    if (builder === "elementor") {
      console.log("Elementor migration: npm run migrate");
    }
  })
  .catch(console.error);
