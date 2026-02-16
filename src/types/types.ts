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

export type UserData = {
  email: string;
  name: string;
  affiliation: number;
} | null;

export type EventConfig = {
  site_url: string;
  year: number;
  name: string;
  school: string;
  operating_organization: string;
  catchCopy: string;
  meta_description: string;
  date: string[];
  date_length: number;
  grade_number: number;
  class_number: number;
  max_attendance_number: number;
  performances_per_day: number;
  last_update: string | null;
};
