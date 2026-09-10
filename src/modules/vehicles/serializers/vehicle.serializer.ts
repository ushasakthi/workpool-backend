import { VehicleDocument } from '../schemas/vehicle.schema';

export interface VehicleView {
  id: string;
  ownerId: string;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  seatsAvailable: number;
  isActive: boolean;
  photoUrl?: string;
}

export function serializeVehicle(vehicle: VehicleDocument): VehicleView {
  return {
    id: vehicle.id,
    ownerId: String(vehicle.ownerId),
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    plateNumber: vehicle.plateNumber,
    seatsAvailable: vehicle.seatsAvailable,
    isActive: vehicle.isActive ?? true,
    photoUrl: photoRoute(vehicle),
  };
}

// The stored value is a local filename — expose it only as the authenticated
// fetch route, with a version tag so the client re-fetches after the photo is
// replaced. Same convention as the user profile photo.
function photoRoute(vehicle: VehicleDocument): string | undefined {
  if (!vehicle.photoUrl) {
    return undefined;
  }
  const updatedAt = (vehicle as unknown as { updatedAt?: Date }).updatedAt;
  const version = updatedAt instanceof Date ? updatedAt.getTime() : 0;
  return `/vehicles/${vehicle.id}/photo?v=${version}`;
}
