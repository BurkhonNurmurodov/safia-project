def map_brigada_name(name):
    if not name: return name
    mapping = {
        "АРС Бригада №1": "Elektrik",
        "АРС Бригада №2": "Universal",
        "АРС Бригада №3": "Svarka",
        "АРС Бригада №4": "Mexanik/Santexnik",
        "АРС Бригада №5": "Universal (Keles)",
    }
    return mapping.get(name, name)
