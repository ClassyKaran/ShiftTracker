import mongoose from 'mongoose';

const GeoCacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // e.g. "lat,lng" or "lat|lng"
  name: { type: String },
  provider: { type: String },
  raw: { type: Object },
  createdAt: { type: Date, default: Date.now },
});

GeoCacheSchema.index({ key: 1 });

export default mongoose.model('GeoCache', GeoCacheSchema);
