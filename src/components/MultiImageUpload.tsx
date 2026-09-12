import React, { useRef, useState } from 'react';
import SafeImage from './SafeImage';
import { showToast } from './Toast';
import { uploadImage } from '../services/storage/imageStorage';
import { useAuth } from '../contexts/AuthContext';
import { describeUnknownError } from '../utils/unknownError';
import { createEntityId } from '../utils/entityId';

interface ImageItem {
  id: string;
  url: string;
  label: string;
}

interface MultiImageUploadProps {
  images: ImageItem[];
  onChange: (images: ImageItem[]) => void;
  maxImages?: number;
  itemName?: string;
  /** RLS scope used when uploading to the platform storage bucket. */
  organizationId?: string;
}

export const MultiImageUpload: React.FC<MultiImageUploadProps> = ({
  images = [],
  onChange,
  maxImages = 4,
  itemName = 'item',
  organizationId,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [previewImage, setPreviewImage] = useState<ImageItem | null>(null);
  const [zoom, setZoom] = useState(1);
  // RLS scope for platform bucket uploads (optional; falls back to local data
  // URLs when the platform backend is disabled).
  const { organizationId: authOrgId } = useAuth();
  const effectiveOrgId = organizationId || authOrgId || undefined;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = () => {
    if (images.length >= maxImages) {
      showToast(`Maximum ${maxImages} images allowed`, 'warning');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be less than 5MB', 'warning');
      return;
    }

    try {
      const url = await uploadImage(file, {
        bucket: 'venue-images',
        organizationId: effectiveOrgId,
      });
      const newImage: ImageItem = {
        id: createEntityId('image', images.map((image) => image.id)),
        url,
        label: `Image ${images.length + 1}`,
      };
      onChange([...images, newImage]);
    } catch (err) {
      showToast(describeUnknownError(err, 'Could not upload the image. Check the file and try again.'), 'warning');
    }
  };

  const handleRemoveImage = (id: string) => {
    onChange(images.filter((img) => img.id !== id));
    if (previewImage?.id === id) {
      setPreviewImage(null);
      setZoom(1);
    }
  };

  const handleLabelChange = (id: string, label: string) => {
    onChange(images.map((img) => (img.id === id ? { ...img, label } : img)));
  };

  const imageCount = images.length;

  return (
    <>
      <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <label className="text-xs font-medium text-blue-700 flex items-center gap-1">
            📷 Image Gallery ({imageCount}/{maxImages})
          </label>

          <div className="flex items-center gap-2">
            {imageCount > 0 && (
              <div className="flex -space-x-2">
                {images.slice(0, 3).map((img) => (
                  <div
                    key={img.id}
                    className="w-8 h-8 rounded overflow-hidden border border-white/50"
                  >
                    <SafeImage
                      src={img.url}
                      alt={img.label || 'Preview image'}
                      className="w-full h-full object-cover"
                      fallback={
                        <div className="w-full h-full flex items-center justify-center bg-gray-200 text-[10px] text-gray-500">
                          ?
                        </div>
                      }
                    />
                  </div>
                ))}

                {imageCount > 3 && (
                  <div className="w-6 h-6 rounded border-2 border-white bg-blue-200 flex items-center justify-center text-xs font-medium text-blue-700">
                    +{imageCount - 3}
                  </div>
                )}
              </div>
            )}

            <span className="text-blue-600">{isExpanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-3 space-y-3">
            <input
              id="multi-image-upload"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Upload gallery image"
              onChange={(e) => {
                e.stopPropagation();
                void handleFileChange(e);
              }}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleImageUpload();
              }}
              disabled={imageCount >= maxImages}
              className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                imageCount >= maxImages
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              }`}
            >
              📷{' '}
              {imageCount >= maxImages
                ? 'Maximum Images Reached'
                : `Add Image (${imageCount}/${maxImages})`}
            </button>

            {images.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {images.map((img, index) => (
                  <div
                    key={img.id}
                    className="bg-white rounded-lg border border-blue-200 overflow-hidden"
                  >
                    <div className="relative aspect-square">
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewImage(img);
                          setZoom(1);
                        }}
                        className="w-full h-full"
                      >
                        <SafeImage
                          src={img.url}
                          alt={img.label || 'Gallery image'}
                          className="w-full h-full object-cover cursor-pointer"
                          fallback={
                            <div className="w-full h-full flex items-center justify-center bg-gray-100 text-xs text-gray-400 cursor-pointer">
                              Broken image
                            </div>
                          }
                        />
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveImage(img.id);
                        }}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-sm hover:bg-red-600 transition-colors shadow"
                      >
                        ✕
                      </button>

                      <div className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">
                        {index + 1}
                      </div>
                    </div>

                    <div className="p-2">
                      <input
                        type="text"
                        value={img.label}
                        onChange={(e) => handleLabelChange(img.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Image label..."
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {images.length === 0 && (
              <div className="text-center py-4 text-sm text-blue-600">
                <p>No images uploaded for this {itemName}</p>
                <p className="text-xs text-blue-400 mt-1">
                  Upload up to {maxImages} images with labels
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {previewImage && (
        <div
          className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"
          onClick={() => {
            setPreviewImage(null);
            setZoom(1);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b">
              <div>
                <div className="font-semibold text-gray-800">
                  {previewImage.label || 'Image Preview'}
                </div>
                <div className="text-xs text-gray-500">
                  Zoom: {Math.round(zoom * 100)}%
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                  className="px-2 py-1 rounded border text-sm hover:bg-gray-50"
                >
                  −
                </button>

                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                >
                  100%
                </button>

                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                  className="px-2 py-1 rounded border text-sm hover:bg-gray-50"
                >
                  +
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPreviewImage(null);
                    setZoom(1);
                  }}
                  className="px-3 py-1 rounded bg-gray-800 text-white text-sm hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="overflow-auto max-h-[calc(90vh-64px)] bg-gray-100 p-4">
              <div style={{ transform: `scale(${zoom})` }}>
                <SafeImage
                  src={previewImage.url}
                  alt={previewImage.label || 'Image preview'}
                  className="max-w-full max-h-[70vh] object-contain"
                  fallback={
                    <div className="w-[320px] h-[220px] max-w-full flex items-center justify-center bg-gray-100 text-gray-500 border border-gray-200 rounded">
                      Preview unavailable
                    </div>
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MultiImageUpload;