import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User } from './src/models/user.model';
import { Role } from './src/models/role.model';
import { config } from './src/config/config';
import { DEFAULT_SUPER_ADMIN, UserRole } from './src/config/constants';

const API_BASE_URL = 'http://localhost:5000/api';
let authToken = '';

// Check if server is running
async function checkServerStatus() {
  try {
    const response = await axios.get(`${API_BASE_URL}/health`);
    console.log('✅ Server status:', response.data);
    return true;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Server is not running or not responding:', errorMessage);
    return false;
  }
}

// Connect to MongoDB
async function connectDB() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(config.databaseUrl);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Create default roles if they don't exist
interface IRoleDocument extends mongoose.Document {
  name: string;
}

async function createDefaultRoles() {
  try {
    const roles = [
      { name: UserRole.SuperAdmin },
      { name: UserRole.Admin },
      { name: UserRole.User },
    ];

    for (const role of roles) {
      await Role.findOneAndUpdate(
        { name: role.name },
        { $setOnInsert: role },
        { upsert: true, new: true }
      );
    }

    console.log('✅ Default roles created/verified');
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error creating default roles:', errorMessage);
    throw error;
  }
}

// Create super admin user
async function createSuperAdmin() {
  try {
    // Check if super admin already exists
    const existingAdmin = await User.findOne({
      email: DEFAULT_SUPER_ADMIN.email,
    });

    if (existingAdmin) {
      console.log('ℹ️ Super admin already exists');
      return existingAdmin;
    }

    // Get the SuperAdmin role
    const superAdminRole = await Role.findOne({ name: UserRole.SuperAdmin });
    if (!superAdminRole) {
      throw new Error('SuperAdmin role not found. Please create roles first.');
    }

    // Create super admin - password will be hashed by the pre-save hook
    const superAdmin = new User({
      ...DEFAULT_SUPER_ADMIN,
      role: superAdminRole._id,
    });

    await superAdmin.save();
    console.log('✅ Super admin created successfully');
    return superAdmin;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error creating super admin:', errorMessage);
    throw error;
  }
}

// Login and get JWT token
async function loginSuperAdmin() {
  try {
    console.log('🔑 Attempting to log in super admin...');
    console.log('   Email:', DEFAULT_SUPER_ADMIN.email);

    const response = await axios.post(
      `${API_BASE_URL}/user/login`,
      {
        email: DEFAULT_SUPER_ADMIN.email,
        password: DEFAULT_SUPER_ADMIN.password,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        validateStatus: (status) => status < 500, // Don't throw for 4xx errors
      }
    );

    if (response.data && response.data.data && response.data.data.accessToken) {
      authToken = response.data.data.accessToken;
      console.log('✅ Successfully logged in as super admin');
      return authToken;
    } else {
      console.error(
        '❌ Login response missing access token. Response:',
        JSON.stringify(response.data, null, 2)
      );
      throw new Error('Login response missing access token');
    }
  } catch (error) {
    let errorMessage = 'Login failed';
    if (axios.isAxiosError(error)) {
      console.error('Axios error details:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      errorMessage = error.response?.data?.message || error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error('❌ Login failed:', errorMessage);
    throw error;
  }
}

const Genre = [
  'action',
  'adventure',
  'animation',
  'comedy',
  'crime',
  'drama',
  'fantasy',
  'horror',
  'musical',
  'romance',
  'science-fiction(sci-fi)',
  'war',
];
const Movie = [
  'avatar-the-way-of-water',
  'black-panther-wakanda-forever',
  'ant-man-and-the-wasp-quantumania',
  'the-lord-of-the-rings-the-fellowship-of-the-ring',
  'kalki-2898-ad',
];
const genreFolder = path.join( __dirname, 'assets', 'images', 'genre');
const movieFolder = path.join( __dirname, 'assets', 'images', 'movie');

async function uploadCategory(
  name: string,
  type: string,
  folderPath: string,
  extension: string
): Promise<void> {
  if (!authToken) {
    console.error('❌ Not authenticated. Please login first.');
    return;
  }
  const imagePath = path.join(folderPath, `${name}.${extension}`);
  if (!fs.existsSync(imagePath)) {
    console.warn(`⚠️ Image not found for: ${name}`);
    return;
  }

  const form = new FormData();
  form.append('name', name);
  form.append('type', type);
  form.append('image', fs.createReadStream(imagePath));

  try {
    const res = await axios.post(`${API_BASE_URL}/category/create`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${authToken}`,
      },
    });
    console.log(`✅ Uploaded ${type}: ${name}`);
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      console.log(`✅ Category "${name}" already exists`);
      return;
    }

    let errorMessage = `Error uploading category "${name}"`;
    if (axios.isAxiosError(err)) {
      errorMessage = err.response?.data?.message || err.message;
    } else if (err instanceof Error) {
      errorMessage = err.message;
    }

    console.error(`❌ ${errorMessage}`);
  }
}

async function seedAll(): Promise<void> {
  try {
    // Check if server is running
    console.log('\n🔄 Checking server status...');
    const isServerRunning = await checkServerStatus();
    if (!isServerRunning) {
      console.log(
        '\n⚠️  Please make sure the server is running before running the seed script.'
      );
      console.log('   Run: npm run dev\n');
      process.exit(1);
    }

    // Connect to MongoDB
    await connectDB();

    // Step 1: Create default roles
    console.log('\n🔧 Setting up roles...');
    await createDefaultRoles();

    // Step 2: Create super admin user
    console.log('\n👑 Creating super admin...');
    await createSuperAdmin();

    // Step 3: Login to get JWT token
    console.log('\n🔑 Logging in...');
    await loginSuperAdmin();

    // Step 4: Seed genres
    console.log('\n🌱 Seeding genres...');
    for (const name of Genre) {
      await uploadCategory(name, 'Genre', genreFolder, 'png');
    }

    // Step 5: Seed movies
    console.log('\n🎬 Seeding movies...');
    for (const name of Movie) {
      await uploadCategory(name, 'Movie', movieFolder, 'webp');
    }

    console.log('\n🎉 Seeding completed successfully!');
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('❌ Seeding failed:', errorMessage);
    if (errorStack) {
      console.error(errorStack);
    }
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// Start the seeding process
seedAll();
