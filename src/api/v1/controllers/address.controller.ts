import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Address } from '@/api/v1/models/address.model';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { AuthRequest } from '@/api/v1/interfaces/auth.interface';

// ==========================================
// CREATE ADDRESS
// ==========================================
export const createAddress = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) throw new Error('Not authenticated');

    const addressData = {
      ...req.body,
      userId: req.user._id,
    };

    // If this is the first address or explicitly set as default
    const addressCount = await Address.countDocuments({ userId: req.user._id }).session(session);
    if (addressCount === 0) {
      addressData.isDefault = true;
    } else if (addressData.isDefault) {
      // Unset previous default
      await Address.updateMany({ userId: req.user._id }, { isDefault: false }).session(session);
    }

    const newAddress = new Address(addressData);
    await newAddress.save({ session });
    await session.commitTransaction();

    return httpResponse(req, res, 201, 'Address created successfully', newAddress);
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// UPDATE ADDRESS
// ==========================================
export const updateAddress = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!req.user) throw new Error('Not authenticated');

    const address = await Address.findOne({ _id: id, userId: req.user._id }).session(session);
    if (!address) throw new Error('Address not found');

    const { isDefault, ...otherData } = req.body;

    if (isDefault === true && !address.isDefault) {
      await Address.updateMany({ userId: req.user._id }, { isDefault: false }).session(session);
      address.isDefault = true;
    }

    Object.assign(address, otherData);

    await address.save({ session });
    await session.commitTransaction();

    return httpResponse(req, res, 200, 'Address updated successfully', address);
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// DELETE ADDRESS
// ==========================================
export const deleteAddress = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!req.user) throw new Error('Not authenticated');

    const addressToDelete = await Address.findOne({ _id: id, userId: req.user._id }).session(session);
    if (!addressToDelete) throw new Error('Address not found');

    const wasDefault = addressToDelete.isDefault;

    await Address.deleteOne({ _id: id }).session(session);

    // If we deleted the default address, make another one default if exists
    if (wasDefault) {
      const anotherAddress = await Address.findOne({ userId: req.user._id }).session(session);
      if (anotherAddress) {
        anotherAddress.isDefault = true;
        await anotherAddress.save({ session });
      }
    }

    await session.commitTransaction();
    return httpResponse(req, res, 200, 'Address deleted successfully');
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// SET DEFAULT ADDRESS
// ==========================================
export const makeDefaultAddress = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!req.user) throw new Error('Not authenticated');

    const address = await Address.findOne({ _id: id, userId: req.user._id }).session(session);
    if (!address) throw new Error('Address not found');

    await Address.updateMany({ userId: req.user._id }, { isDefault: false }).session(session);
    address.isDefault = true;

    await address.save({ session });
    await session.commitTransaction();

    return httpResponse(req, res, 200, 'Address set as default successfully', address);
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET MY ADDRESSES
// ==========================================
export const getMyAddresses = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('Not authenticated');

    const addresses = await Address.find({ userId: req.user._id }).sort({
      isDefault: -1,
      createdAt: -1,
    });

    return httpResponse(req, res, 200, 'Addresses fetched successfully', addresses);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};
