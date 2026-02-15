export type GalleryImage = {
  src: string;
  alt: string;
  width: number;
};

export type GalleryProps = {
  images: GalleryImage[];
};

export type Session = {
  user: {
    email?: string;
  };
} | null;
