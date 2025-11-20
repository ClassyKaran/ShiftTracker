#!/usr/bin/env node
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Session from '../models/Session.js';
import { reverseGeocode } from '../utils/geocode.js';

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/shifttracker');
  console.log('connected');
  const cursor = Session.find({ locationName: { $in: [null, ''] }, location: { $exists: true, $ne: '' } }).cursor();
  let count = 0;
  for (let s = await cursor.next(); s != null; s = await cursor.next()) {
    try {
      const loc = s.location;
      let lat = null, lng = null;
      if (typeof loc === 'string' && loc.indexOf(',') !== -1) {
        const parts = loc.split(',').map(p => p.trim());
        const a = parseFloat(parts[0]); const b = parseFloat(parts[1]);
        if (!Number.isNaN(a) && !Number.isNaN(b)) { lat = a; lng = b; }
      } else if (typeof loc === 'object' && loc.lat && loc.lng) { lat = loc.lat; lng = loc.lng; }
      if (lat != null && lng != null) {
        const g = await reverseGeocode(lat, lng);
        if (g && g.name) {
          s.locationName = g.name;
          await s.save();
          count++;
          if (count % 50 === 0) console.log('backfilled', count);
        }
      }
    } catch (e) {
      console.warn('backfill error', e.message || e);
    }
  }
  console.log('done. updated', count);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
