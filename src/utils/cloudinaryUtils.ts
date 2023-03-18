import cloudinary from '../config/cloudinary';
import ErrorHandler from './ErrorHandler';
import logger from './logger';

const uploadMediaToCloudinary = async (imagePath: string, preset: string) => {
  type ResourceType = 'image' | 'video' | 'raw' | 'auto';

  const resourceType = imagePath.split('/')[0].split(':')[1];

  const options = {
    resource_type: resourceType as ResourceType,
    upload_preset: preset,
    use_filename: true,
    unique_filename: false,
    overwrite: true,
  };

  try {
    const result = await cloudinary.uploader.upload(imagePath, options);
    return result.url;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const getAssetInfoFromCloudinary = async (publicId: string) => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return result;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

const getPublicId = (imageURL: string) => imageURL.split('/').pop()?.split('.')[0];

const deleteMediaFromCloudinary = async (imageURL: string, preset: string) => {
  try {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const public_id = getPublicId(imageURL);

    if (!public_id) throw new ErrorHandler(500, 'Something went wrong');

    const pathSegments = imageURL.split('/');
    const resourceType = pathSegments[4];

    const result = await cloudinary.uploader.destroy(`${preset}/${public_id}`, {
      invalidate: true,
      resource_type: resourceType,
    });
    return result;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

export { uploadMediaToCloudinary, getAssetInfoFromCloudinary, deleteMediaFromCloudinary };