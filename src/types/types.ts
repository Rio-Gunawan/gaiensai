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
    id: string;
    email?: string | null;
  };
} | null;
