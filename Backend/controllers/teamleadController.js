import TeamLeadTrack from '../models/TeamLeadTrack.js';
import User from '../models/User.js';

export const getTracked = async (req, res) => {
  try {
    const teamleadId = req.user._id;
    const doc = await TeamLeadTrack.findOne({ teamleadId }).populate('tracked', 'name employeeId role');
    return res.json({ tracked: (doc && doc.tracked) || [] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Failed to fetch tracked users' });
  }
};

export const setTracked = async (req, res) => {
  try {
    const teamleadId = req.user._id;
    const { tracked } = req.body || {};
    const ids = Array.isArray(tracked) ? tracked : [];
    // validate ids
    const users = await User.find({ _id: { $in: ids } }).select('_id');
    const validIds = users.map(u => u._id);
    const doc = await TeamLeadTrack.findOneAndUpdate(
      { teamleadId },
      { $set: { tracked: validIds } },
      { upsert: true, new: true }
    ).populate('tracked', 'name employeeId role');
    return res.json({ tracked: doc.tracked || [] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Failed to save tracked users' });
  }
};
