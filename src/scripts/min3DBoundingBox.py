import numpy as np
from scipy.spatial import ConvexHull
from scipy.spatial.transform import Rotation
import json

demosBool = True

def getDesmosPoints(vals):
    if type(vals[0]) != np.ndarray:
        if (demosBool):
            return f"({vals[0]:.3f}, {vals[1]:.3f}, {vals[2]:.3f})"
        else:
            return f"[{vals[0]:.3f}, {vals[1]:.3f}, {vals[2]:.3f}]"
    else:
        str_arr = [getDesmosPoints(point) for point in vals]
        return f'[{", ".join(str_arr)}]'

def minimum_bounding_box(points):
    # Find the convex hull of the points
    hull = ConvexHull(points)

    # Extract the vertices of the convex hull
    hull_vertices = points[hull.vertices]

    # Initialize variables to store the minimum volume and corresponding box
    min_volume = float('inf')
    min_bbox = None

    # Iterate through pairs of vertices to find the minimum volume bounding box
    for i in range(len(hull_vertices)):
        for j in range(i + 1, len(hull_vertices)):
            for k in range(j + 1, len(hull_vertices)):
                # Form a box using the three selected vertices
                vertices = [hull_vertices[i], hull_vertices[j], hull_vertices[k]]

                # Calculate the center and orientation of the box
                center = np.mean(vertices, axis=0)
                rotation = Rotation.from_matrix(np.eye(3))

                # Update the orientation to align with the box
                for l in range(3):
                    for m in range(3):
                        if l != m:
                            v1 = vertices[l] - center
                            v2 = vertices[m] - center
                            axis = np.cross(v1, v2)
                            if np.linalg.norm(axis) > 1e-6:
                                axis /= np.linalg.norm(axis)
                                angle = np.arccos(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2)))
                                rotation = Rotation.from_rotvec(angle * axis)

                # Rotate the convex hull vertices to align with the box
                rotated_hull = rotation.apply(hull_vertices - center)

                # Find the minimum and maximum coordinates in each dimension
                min_coords = np.min(rotated_hull, axis=0)
                max_coords = np.max(rotated_hull, axis=0)

                # Calculate the volume of the bounding box
                volume = np.prod(max_coords - min_coords)

                # Update the minimum volume and corresponding box
                if volume < min_volume:
                    min_volume = volume
                    min_bbox = (min_coords, max_coords, center, rotation)

    return min_bbox

def approxMinBoundingBox(points):

    point_mean = np.mean(points, axis=0)

    covariance_matrix = np.zeros((len(point_mean), len(point_mean)))

    for point in points:
        point_minus = point - point_mean
        covariance_matrix += np.outer(point_minus, point_minus)

    covariance_matrix /= (len(points))
    # covariance_matrix = np.cov(points, rowvar=0)
    # cov_matr2 = np.cov(points, y=None, rowvar=0, bias=1)

    # eign_val, eign_vec = np.linalg.eig(covariance_matrix)
    _, eign_vec = np.linalg.eigh(covariance_matrix)
    print(f"Eigen vectors: {getDesmosPoints(eign_vec)}")

    # Transformation matrix format
    def try_to_normalize(v):
        n = np.linalg.norm(v)
        if n < np.finfo(float).resolution:
            raise ZeroDivisionError
        return v / n

    r = try_to_normalize(eign_vec[:, 0])
    u = try_to_normalize(eign_vec[:, 1])
    f = try_to_normalize(eign_vec[:, 2])

    rot2 = np.array((r, u, f)).T
    rot_points = np.asarray([rot2.dot(p) for p in points])
    obb_min = np.min(rot_points, axis=0)
    obb_max = np.max(rot_points, axis=0)

    rot_center = rot2.dot(point_mean)
    # print(f"Rot points: {getDesmosPoints([p-rot_center for p in rot_points])}")

    return (obb_min, obb_max, point_mean, rot2)


    # Take one vector, translate to axis
    x_axis = [1, 0, 0]
    s_vec = eign_vec[0]

    ppd_vector = np.cross(x_axis, s_vec) # get vector perpendicular to it
    ppd_vector /= np.linalg.norm(ppd_vector) # norm vector

    angle = np.arccos(np.dot(x_axis, s_vec) / (np.linalg.norm(x_axis) * np.linalg.norm(s_vec)))
    rotation = Rotation.from_rotvec(angle * ppd_vector)

    rotated_points = rotation.apply(points - point_mean)
    # rotated_points = rotation.apply(points)

    # print(f"Rotation Points: {getDesmosPoints(rotated_points)}")

    # Find the minimum and maximum coordinates in each dimension
    min_coords = np.min(rotated_points, axis=0)
    max_coords = np.max(rotated_points, axis=0)

    min_bbox = (min_coords, max_coords, point_mean, rotation)
    # print("done")

    return min_bbox



# Read file
filename = 'data/blue_samples.txt'
file_text_lines = open(filename).readlines()

# Example usage:
if __name__ == "__main__":
    # Replace this list with your own set of 3D points
    samples = set()
    for line in file_text_lines:
        line = line.replace('(', '').replace(')', '')
        pxs = line.split(',')
        ret = []
        for px in pxs:
            ret.append(int(px))
        
        if tuple(ret) in samples:
            print(f'DUPLICATE {ret}')
        samples.add(tuple(ret))

    points = np.array(list(samples))

    # points = np.array([
        #(255, 255, 255),(251, 249, 245),(253, 250, 249),(250, 248, 242),(255, 253, 247),(253, 251, 245),(255, 255, 254),(217, 215, 209),(251, 249, 243),(248, 246, 242),(252, 249, 248),(252, 250, 244),(255, 255, 248),(220, 218, 212),(244, 241, 240),(233, 230, 229),(244, 241, 242),(252, 250, 246),(247, 245, 241),(238, 236, 232),(230, 228, 224),(247, 246, 237),(226, 224, 218),(252, 249, 250),(252, 252, 250),(255, 255, 253),(239, 236, 237),(254, 251, 252),(255, 252, 253),(248, 248, 246),(241, 240, 231),(255, 255, 250),(244, 244, 242),(242, 242, 240),(251, 251, 249),(250, 250, 248),(243, 240, 241),(232, 232, 230),(245, 242, 243),(249, 249, 247),(230, 228, 222),(244, 242, 236),(255, 255, 251),(254, 252, 246),(254, 252, 248),(247, 244, 245),(248, 244, 247),(229, 225, 228),(254, 250, 253),(255, 253, 255),(255, 254, 255),(251, 248, 247),(255, 252, 251),(254, 251, 250),(250, 247, 246),(229, 226, 225),(239, 237, 231),(252, 248, 251),(195, 192, 193),(227, 225, 219),(255, 255, 252),(250, 247, 248),(250, 246, 249),(251, 247, 250),(255, 251, 254),(246, 243, 242),(255, 254, 253),(255, 255, 249),(240, 238, 232),(253, 250, 251),(248, 250, 240),(243, 241, 237),(250, 248, 244),(251, 248, 249),(248, 245, 244),(241, 239, 233),(238, 236, 230),(253, 251, 247),(255, 253, 249),(248, 247, 238),(244, 242, 238),(246, 244, 240),(247, 245, 239),(253, 249, 252),(245, 243, 239),(222, 219, 220),(236, 234, 230),(246, 244, 238),(247, 244, 243),(232, 229, 230),(224, 222, 216),(248, 246, 240),(247, 243, 246),(231, 229, 225),(243, 241, 235),(234, 231, 230),(238, 235, 236),(237, 235, 229),(248, 245, 246),(236, 234, 228),(241, 239, 235),(237, 234, 235),(241, 238, 239),(240, 237, 236),(239, 237, 233),(234, 232, 226),(210, 208, 204),(236, 233, 232),(234, 232, 228),(229, 227, 223),(237, 235, 231),(243, 240, 239),(245, 242, 241),(233, 231, 227),(236, 233, 234),(216, 213, 214),(224, 221, 220),(224, 221, 222),(246, 243, 244),(243, 245, 234),
        #(245, 251, 255), (247, 253, 255), (246,252,255), (215,221,225), (247,255,255), (208,209,214), (218,222,226), (205,211,213), (245,254,255), (255,253,255), (255,252,255)
        # (10,0,10), (5,0,5), (5,5,5), (10,5,10), (2,0,7)
    # ])

    # print(f"Points: {getDesmosPoints(points)}")

    min_bbox = approxMinBoundingBox(points)

    # min_bbox = minimum_bounding_box(points)
    min_coords, max_coords, center, rotation = min_bbox
    print("Smallest Rotated Bounding Box Parameters:")
    print(f"Volume: {np.prod(max_coords - min_coords):.3f}")

    print("Minimum Coordinates:", getDesmosPoints(min_coords))
    print("Maximum Coordinates:", getDesmosPoints(max_coords))
    print("Center:", getDesmosPoints(center))
    print("Rotation Matrix:")
    print(getDesmosPoints(rotation))
    # print(getDesmosPoints(rotation.as_matrix()))

    obj = {
        "min": list(min_coords),
        "max": list(max_coords),
        "center": list(center),
        "rot": [list (m) for m in rotation]
    }
    print(f"JSON output: {json.dumps(obj)}")


while (True):
    point_input = input('Enter a point to test> ')
    point_str = point_input.split(',')
    point_arr = [int(ps) for ps in point_str if ps != ""]
    if len(point_arr) < 3:
        print("Invalid input! Restart \n")
        continue
    
    test_points = np.array(point_arr)
    # t_point = point_arr - center
    vals = rotation.dot(test_points)
    # vals -= rotation.dot(center)

    for i in range(3):
        if (vals[i] >= min_coords[i]):
            print(f"[{i}] r_point {vals[i]} > min_coord {min_coords[i]}")   
        else:
            break 
        if (vals[i] <= max_coords[i]):
            print(f"[{i}] r_point {vals[i]} < max_coord {max_coords[i]}")
        else:
            break
    else:
        print("Point PASSED!")

    print("Finished check\n")