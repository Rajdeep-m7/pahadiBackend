import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { WarehouseLocation } from '@/api/v1/models/warehouse.model';
import { Product } from '@/api/v1/models/product.model';
import { shiprocketService } from '@/api/v1/services/shiprocket.service';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';

// ==========================================
// CREATE WAREHOUSE (Syncs with Shiprocket)
// ==========================================
export const createWarehouse = async (req: Request, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const data = req.body;

    const shiprocketPayload = {
      pickup_location: data.pickupLocation, // Must be unique, no spaces
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: data.address,
      address_2: data.address2 || '',
      city: data.city,
      state: data.state,
      country: 'India',
      pin_code: data.pinCode,
    };

    // 1. Phase One: Sync with Shiprocket
    // This will throw an error if Shiprocket rejects the address, stopping the DB save
    const srResponse = await shiprocketService.addPickupLocation(shiprocketPayload);

    // 2. Phase Two: Save to MongoDB
    const newWarehouse = new WarehouseLocation({
      ...data,
      isActive: srResponse.status !== 0,
      isVerified: srResponse.phone_verified === 1,
    });

    await newWarehouse.save({ session });
    await session.commitTransaction();

    return httpResponse(req, res, 201, 'Warehouse successfully synced and created', newWarehouse);
  } catch (error: unknown) {
    await session.abortTransaction();
    // Use 400 for bad requests (like Shiprocket validation fails), 500 otherwise
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// SYNC WAREHOUSES WITH SHIPROCKET
// ==========================================
export const syncWithShiprocket = async (req: Request, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // 1. Fetch data from Shiprocket
    const srAddresses = await shiprocketService.getPickupLocations();
    const srNicknames = srAddresses.map((addr) => addr.pickup_location);

    // 2. Fetch local warehouses
    const localWarehouses = await WarehouseLocation.find().session(session);

    const syncResults = {
      updated: 0,
      created: 0,
      removed: 0,
    };

    // 3. Update or Create from Shiprocket data
    for (const srAddr of srAddresses) {
      const isVerified = srAddr.phone_verified === 1;
      const isActive = srAddr.status !== 0;

      const existingWarehouse = localWarehouses.find(
        (w) => w.pickupLocation === srAddr.pickup_location
      );

      if (existingWarehouse) {
        // Update if details changed (specifically verification and active status)
        if (existingWarehouse.isVerified !== isVerified || existingWarehouse.isActive !== isActive) {
          existingWarehouse.isVerified = isVerified;
          existingWarehouse.isActive = isActive;
          await existingWarehouse.save({ session });
          syncResults.updated++;
        }
      } else {
        // Create new local entry if it exists in Shiprocket but not in DB
        const newWarehouse = new WarehouseLocation({
          pickupLocation: srAddr.pickup_location,
          name: srAddr.name,
          email: srAddr.email,
          phone: srAddr.phone,
          address: srAddr.address,
          address2: srAddr.address_2,
          city: srAddr.city,
          state: srAddr.state,
          country: srAddr.country,
          pinCode: srAddr.pin_code,
          isActive: isActive,
          isVerified: isVerified,
        });
        await newWarehouse.save({ session });
        syncResults.created++;
      }
    }

    // 4. Remove local warehouses that don't exist in Shiprocket
    for (const localW of localWarehouses) {
      if (!srNicknames.includes(localW.pickupLocation)) {
        await WarehouseLocation.findByIdAndDelete(localW._id).session(session);
        syncResults.removed++;
      }
    }

    await session.commitTransaction();

    return httpResponse(req, res, 200, 'Warehouses synchronized with Shiprocket', syncResults);
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 500);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET ALL WAREHOUSES
// ==========================================
export const getWarehouses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isActive } = req.query;
    let filter = {};

    if (isActive !== undefined) {
      filter = { isActive: isActive === 'true' };
    }

    const warehouses = await WarehouseLocation.find(filter).sort({ createdAt: -1 });

    return httpResponse(req, res, 200, 'Warehouses fetched successfully', warehouses);
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET SINGLE WAREHOUSE
// ==========================================
export const getWarehouseById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const warehouse = await WarehouseLocation.findById(req.params.id);

    if (!warehouse) throw new Error('Warehouse not found');

    return httpResponse(req, res, 200, 'Warehouse fetched successfully', warehouse);
  } catch (error: unknown) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// UPDATE WAREHOUSE (Local Restricted Fields)
// ==========================================
export const updateWarehouse = async (req: Request, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // SECURITY: Prevent admins from changing core address fields that would break Shiprocket Sync
    delete updateData.pickupLocation; // Shiprocket strictly forbids changing the nickname
    delete updateData.pinCode;
    delete updateData.state;
    delete updateData.city;

    const updatedWarehouse = await WarehouseLocation.findByIdAndUpdate(
      id,
      { $set: updateData },
      { returnDocument: 'after', runValidators: true, session }
    );

    if (!updatedWarehouse) throw new Error('Warehouse not found');

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      200,
      'Warehouse updated successfully (Local details only)',
      updatedWarehouse
    );
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET PRODUCTS LINKED TO WAREHOUSE
// ==========================================
export const getWarehouseProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only return basic product info to keep the payload small
    const products = await Product.find({ pickupWareHouseId: req.params.id })
      .select('title coverImage isActive')
      .lean();

    return httpResponse(req, res, 200, 'Linked products fetched successfully', {
      count: products.length,
      products,
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};
