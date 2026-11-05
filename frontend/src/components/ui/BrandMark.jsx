export default function BrandMark({ className = 'h-9 w-9' }) {
  return (
    <img
      src="/images/hideout24-logo.webp"
      alt=""
      width="512"
      height="385"
      decoding="async"
      className={`${className} shrink-0 object-contain`}
    />
  );
}
