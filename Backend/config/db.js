import mongoose from 'mongoose';

const connectDB = async () => {
  const uri = process.env.MONGO_URI ;
  await mongoose.connect(uri, { useNewUrlParser: true});
  console.log('MongoDB connected 😂');
  // console.log("mongo uri from db", uri);
  
};

export default connectDB;
