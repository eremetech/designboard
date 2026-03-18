import re

with open('/Users/SvetlaMaria/Desktop/WORK/claude.me/desgin_board/index.html', 'r') as f:
    content = f.read()

def replace_in_css(name, old_css, new_css):
    global content
    # Find the object with the given name
    pattern = r'(\{ name: "' + re.escape(name) + r'".*?css: `)(.*?)(`, prompt:)'
    
    def repl(match):
        css_content = match.group(2)
        # We can just replace the whole CSS if we know it, or just replace colors
        return match.group(1) + new_css + match.group(3)
        
    content = re.sub(pattern, repl, content, flags=re.DOTALL)

def replace_color_in_item(name, old_color, new_color):
    global content
    pattern = r'(\{ name: "' + re.escape(name) + r'".*?css: `.*?`)'
    
    def repl(match):
        return match.group(0).replace(old_color, new_color)
        
    content = re.sub(pattern, repl, content, flags=re.DOTALL)

# Borders & Outlines
# Let's just replace #1a1a24 with #f8fafc and #2a2a3a with #e2e8f0 in the whole section?
# Actually, it's safer to target specific items.

