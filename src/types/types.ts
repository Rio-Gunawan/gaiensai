export type GalleryImage = {
  src: string;
  alt: string;
  width: number;
};

export type GalleryProps = {
  images: GalleryImage[];
};
