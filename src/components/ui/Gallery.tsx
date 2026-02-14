import styles from './Gallery.module.css';

export type GalleryImage = {
  src: string;
  alt: string;
};

export type GalleryProps = {
  images: GalleryImage[];
};

const Gallery = ({ images }: GalleryProps) => {
  return (
    <div className={styles.gallery} aria-label='写真ギャラリー'>
      <ul className={styles.track}>
        {images.map((image) => (
          <li className={styles.item} key={image.src}>
            <img
              className={styles.image}
              src={image.src}
              alt={image.alt}
              loading='lazy'
              decoding='async'
            />
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Gallery;
