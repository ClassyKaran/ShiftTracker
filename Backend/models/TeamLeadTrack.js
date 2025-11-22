import mongoose from 'mongoose';

const TeamLeadTrackSchema = new mongoose.Schema({
  teamleadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  tracked: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

export default mongoose.model('TeamLeadTrack', TeamLeadTrackSchema);
