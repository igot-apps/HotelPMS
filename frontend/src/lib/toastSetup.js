import toast from 'react-hot-toast';

// The request layer shows an error toast for every failed request, and many screens also show
// the same message themselves. Give identical messages the same toast id so they appear once.
const sameMessageOnce = (show) => (message, options = {}) =>
  show(message, typeof message === 'string' && !options.id ? { ...options, id: `msg:${message}` } : options);

toast.error = sameMessageOnce(toast.error);
toast.success = sameMessageOnce(toast.success);
