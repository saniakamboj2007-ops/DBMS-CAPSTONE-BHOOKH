// ============================================================================
// BHOOKH — Restaurant Discovery & Listing Controller
// ============================================================================

const db = require('../models/database');

exports.getAllRestaurants = async (req, res) => {
  try {
    const { search, cuisine, locality, pure_veg, sort, min_rating } = req.query;

    const filters = {};
    if (search) filters.search = search;
    if (cuisine) filters.cuisine = cuisine;
    if (locality) filters.locality = locality;
    if (pure_veg !== undefined && pure_veg !== '') filters.pure_veg = pure_veg === 'true' || pure_veg === '1';
    if (min_rating) filters.min_rating = parseFloat(min_rating);
    if (sort) filters.sort = sort;

    const restaurants = db.findRestaurants(filters);

    res.json({
      success: true,
      total_count: restaurants.length,
      restaurants
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch restaurants.', error: error.message });
  }
};

exports.getRestaurantById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const restaurant = db.findRestaurantById(id);

    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant not found.' });
    }

    const categories = db.getRestaurantCategories(id);
    const menuItems = db.getRestaurantMenuItems(id);
    const reviews = db.tables.reviews.filter(r => r.restaurant_id === id).map(rev => {
      const reviewer = db.findUserById(rev.user_id);
      return {
        ...rev,
        user_name: reviewer ? reviewer.full_name : 'Verified Customer'
      };
    });

    res.json({
      success: true,
      restaurant: {
        ...restaurant,
        categories,
        menu_items: menuItems,
        reviews
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve restaurant details.', error: error.message });
  }
};

exports.getFeaturedRestaurants = async (req, res) => {
  try {
    const featured = db.tables.restaurants
      .filter(r => r.is_active && r.rating >= 4.2)
      .slice(0, 6);
    res.json({ success: true, restaurants: featured });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch featured restaurants.', error: error.message });
  }
};

exports.getCuisines = async (req, res) => {
  try {
    const set = new Set();
    db.tables.restaurants.forEach(r => {
      r.cuisine_type.split(',').forEach(c => set.add(c.trim()));
    });
    res.json({ success: true, cuisines: Array.from(set) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch cuisines.', error: error.message });
  }
};
